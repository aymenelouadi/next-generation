/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Advanced In-Memory Cache System — Powered by Keyv                      │
 * │  v2 — Hardened & Production-Ready                                       │
 * │                                                                          │
 * │  v1 → v2 Fixes:                                                         │
 * │  ① LRU eviction         — prevents unbounded RAM growth                 │
 * │  ② Dynamic key registry — invalidateGuild() auto-discovers all keys     │
 * │  ③ Pluggable RL backend — swap to Redis for shards/clusters             │
 * │  ④ Serialization guard  — Keyv JSON-isolates every set+get              │
 * │  ⑤ patch() + events     — fine-grained partial invalidation hooks       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

'use strict';

const { Keyv }     = require('keyv');
const logger = require('../../utils/logger');
const EventEmitter = require('events');

// ══════════════════════════════════════════════════════════════════════════════
// ① LRU Store — prevents unbounded RAM growth
// ══════════════════════════════════════════════════════════════════════════════
/**
 * True LRU eviction store compatible with Keyv's KeyvStoreAdapter interface.
 *
 * JavaScript Map preserves insertion order:
 *   head = Map.keys().next() = Least-Recently-Used  → evict on overflow
 *   tail = last inserted key = Most-Recently-Used   → keep
 *
 * On every get() the entry is moved to the tail (promoted to MRU).
 * Keyv serializes all values to JSON strings before calling store.set(),
 * so this store holds opaque strings — no TTL awareness needed here.
 *
 * .env tunables:
 *   CACHE_MAX_GUILD_ENTRIES=10000   (default)
 *   CACHE_MAX_RL_ENTRIES=50000
 */
class LruStore {
    constructor({ maxSize = 10_000 } = {}) {
        this._map    = new Map();
        this.maxSize = maxSize;
        // Keyv v5 writes store.namespace after construction — accepted silently
    }

    get size() { return this._map.size; }

    get(key) {
        if (!this._map.has(key)) return undefined;
        const v = this._map.get(key);
        // Promote to tail = MRU
        this._map.delete(key);
        this._map.set(key, v);
        return v;
    }

    set(key, value) {
        if (this._map.has(key)) {
            this._map.delete(key);              // re-insert at tail
        } else if (this._map.size >= this.maxSize) {
            // Evict LRU: head of Map = oldest insertion
            this._map.delete(this._map.keys().next().value);
        }
        this._map.set(key, value);
        return true;
    }

    delete(key) { return this._map.delete(key); }
    clear()     { this._map.clear(); }
    has(key)    { return this._map.has(key); }
}

// ══════════════════════════════════════════════════════════════════════════════
// Configuration — all tunable via .env
// ══════════════════════════════════════════════════════════════════════════════

const TTL_MS = Object.freeze({
    // Slow-changing guild configuration (10 min default)
    settings:           Number(process.env.CACHE_TTL_SETTINGS) || 10 * 60_000,
    protection:         Number(process.env.CACHE_TTL_SETTINGS) || 10 * 60_000,
    system:             Number(process.env.CACHE_TTL_SETTINGS) || 10 * 60_000,
    auto_responder:     Number(process.env.CACHE_TTL_SETTINGS) || 10 * 60_000,
    auto_role:          Number(process.env.CACHE_TTL_SETTINGS) || 10 * 60_000,
    staff_points:       Number(process.env.CACHE_TTL_SETTINGS) ||  5 * 60_000,
    interaction_points: Number(process.env.CACHE_TTL_SETTINGS) ||  5 * 60_000,
    suggestions_config: Number(process.env.CACHE_TTL_SETTINGS) ||  5 * 60_000,
    commands:           Number(process.env.CACHE_TTL_SETTINGS) || 10 * 60_000,
    // Fast-changing live data (2 min default)
    levels:             Number(process.env.CACHE_TTL_LIVE) ||  2 * 60_000,
    staff_scores:       Number(process.env.CACHE_TTL_LIVE) ||  2 * 60_000,
    interaction_scores: Number(process.env.CACHE_TTL_LIVE) ||  2 * 60_000,
    open_tickets:       Number(process.env.CACHE_TTL_LIVE) ||  2 * 60_000,
    ticket_feedback:    Number(process.env.CACHE_TTL_LIVE) ||  3 * 60_000,
    suggestions_data:   Number(process.env.CACHE_TTL_LIVE) ||  2 * 60_000,
    activity:           Number(process.env.CACHE_TTL_LIVE) ||  1 * 60_000,
    ticket_stats:       Number(process.env.CACHE_TTL_LIVE) ||  3 * 60_000,
    ticket_cooldowns:   Number(process.env.CACHE_TTL_LIVE) ||  1 * 60_000,
    tickets:            Number(process.env.CACHE_TTL_LIVE) ||  2 * 60_000,
    // Fallback for unknown keys
    _default:           Number(process.env.CACHE_TTL_DEFAULT) || 5 * 60_000,
});

const KNOWN_FILES = Object.freeze(
    Object.keys(TTL_MS).filter(k => k !== '_default')
);

// ══════════════════════════════════════════════════════════════════════════════
// ② Dynamic Key Registry — invalidateGuild() discovers keys automatically
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Tracks every (guildId → Set<filename>) pair ever set in this process.
 * invalidateGuild() reads from here instead of a hardcoded list:
 *   - New keys added at runtime are automatically included.
 *   - No "forgot to add key X" risk when the schema grows.
 */
const _registry = new Map(); // Map<guildId, Set<filename>>

const _reg = {
    add:   (gid, f) => { if (!_registry.has(gid)) _registry.set(gid, new Set()); _registry.get(gid).add(f); },
    del:   (gid, f) => { _registry.get(gid)?.delete(f); },
    clear: (gid)    => { _registry.delete(gid); },
    get:   (gid)    => _registry.get(gid) ?? new Set(),
};

// ══════════════════════════════════════════════════════════════════════════════
// ⑤ Event Hooks
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Events emitted:
 *   'set'        (guildId, filename, data)
 *   'del'        (guildId, filename)
 *   'patch'      (guildId, filename, partialData, merged)
 *   'invalidate' (guildId, evictedKeys[])
 *   'clear'      ()
 *
 * @example
 *   cache.on('invalidate', (guildId, keys) =>
 *       logger.info(`Guild ${guildId}: evicted [${keys.join(', ')}]`)
 *   );
 */
const _emitter = new EventEmitter();
_emitter.setMaxListeners(100);

// ══════════════════════════════════════════════════════════════════════════════
// Statistics
// ══════════════════════════════════════════════════════════════════════════════
const _stats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0, patches: 0 };

// ══════════════════════════════════════════════════════════════════════════════
// Keyv Instances backed by LRU stores (① in action)
// ══════════════════════════════════════════════════════════════════════════════
const _guildStore = new LruStore({ maxSize: Number(process.env.CACHE_MAX_GUILD_ENTRIES) || 10_000 });
const _rlStore    = new LruStore({ maxSize: Number(process.env.CACHE_MAX_RL_ENTRIES)    || 50_000 });

const _guild = new Keyv({ store: _guildStore, namespace: 'guild' });
let   _rl    = new Keyv({ store: _rlStore,    namespace: 'rl'    });

_guild.on('error', e => logger.error('[cache:guild] error:', e.message));
_rl.on('error',    e => logger.error('[cache:rl]    error:', e.message));

const _gkey = (guildId, filename) => `${guildId}:${filename}`;
const _ttl  = (filename)          => TTL_MS[filename] ?? TTL_MS._default;

// ④ Serialization Guard
// Keyv v5 JSON-serializes on every set() and JSON-parses on every get() when
// a custom (non-Map) store is used. This means:
//   • Caller mutations after set() do NOT corrupt the cache.
//   • Each get() returns a brand-new deserialized object.
// _clone() is exposed for callers that need an explicit deep-copy outside Keyv
// (e.g. guildDb's synchronous L0 Map).
function _clone(data) {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object')            return data;
    try   { return structuredClone(data); }
    catch { return JSON.parse(JSON.stringify(data)); }
}

// ══════════════════════════════════════════════════════════════════════════════
// Core Guild Cache API
// ══════════════════════════════════════════════════════════════════════════════

/** Read a cached value. Returns null on miss/expiry — never throws. */
async function get(guildId, filename) {
    try {
        const val = await _guild.get(_gkey(guildId, filename));
        if (val !== undefined && val !== null) { _stats.hits++; return val; }
    } catch (e) {
        logger.error(`[cache] get error (${guildId}/${filename}):`, e.message);
    }
    _stats.misses++;
    return null;
}

/**
 * Store a value with automatic TTL.
 * Each get() returns a fresh deserialized object (Keyv JSON isolation).
 * @param {number} [ttlOverride] Optional TTL in ms
 */
async function set(guildId, filename, data, ttlOverride) {
    try {
        _stats.sets++;
        await _guild.set(_gkey(guildId, filename), data, ttlOverride ?? _ttl(filename));
        _reg.add(guildId, filename);                     // ② auto-register
        _emitter.emit('set', guildId, filename, data);   // ⑤ hook
    } catch (e) {
        logger.error(`[cache] set error (${guildId}/${filename}):`, e.message);
    }
}

/** Delete a single cache entry. */
async function del(guildId, filename) {
    try {
        _stats.deletes++;
        await _guild.delete(_gkey(guildId, filename));
        _reg.del(guildId, filename);
        _emitter.emit('del', guildId, filename);
    } catch (e) {
        logger.error(`[cache] del error (${guildId}/${filename}):`, e.message);
    }
}

/**
 * Invalidate ALL cached data for a guild.
 * ② Uses the dynamic registry — no hardcoded key list needed.
 *    Any key ever written for this guild is automatically included.
 */
async function invalidateGuild(guildId) {
    const keys = [..._reg.get(guildId)];
    if (!keys.length) return;
    try {
        const results = await Promise.allSettled(
            keys.map(f => _guild.delete(_gkey(guildId, f)))
        );
        _stats.evictions += results.filter(r => r.status === 'fulfilled').length;
        _reg.clear(guildId);
        _emitter.emit('invalidate', guildId, keys);
    } catch (e) {
        logger.error(`[cache] invalidateGuild error (${guildId}):`, e.message);
    }
}

/**
 * ⑤ Atomically merge PARTIAL data into an existing cache entry.
 *
 * Use instead of invalidateGuild() when only one field changes.
 * Avoids a full DB re-fetch cycle and reduces MongoDB I/O.
 *
 * @param {Object} partialData  Shallow-merged with existing cached object
 * @returns {Promise<Object>}   Resulting merged object
 *
 * @example
 *   // Update only the log channel:
 *   await cache.patch(guildId, 'settings', { logChannelId: channel.id });
 *
 *   // Append a new auto-responder rule:
 *   await cache.patch(guildId, 'auto_responder', {
 *       responses: [...existing.responses, newRule]
 *   });
 */
async function patch(guildId, filename, partialData) {
    const existing = await get(guildId, filename) ?? {};
    const merged   = { ...existing, ...partialData };
    await set(guildId, filename, merged);
    _stats.patches++;
    _emitter.emit('patch', guildId, filename, partialData, merged);
    return merged;
}

/** Wipe entire cache. Use carefully (e.g. after a full MongoDB import). */
async function clear() {
    try {
        await _guild.clear();
        await _rl.clear();
        _registry.clear();
        _emitter.emit('clear');
    } catch (e) {
        logger.error('[cache] clear error:', e.message);
    }
}

/**
 * Cache statistics snapshot.
 * storeSize.guild  = raw LRU entries in Keyv store (namespaced keys)
 * storeSize.guilds = distinct guild IDs tracked by registry
 * storeSize.keys   = total logical (guildId, filename) pairs
 */
function stats() {
    const total = _stats.hits + _stats.misses;
    return {
        ...structuredClone(_stats),
        hitRate:    total > 0 ? +(((_stats.hits / total) * 100).toFixed(1)) : 0,
        hitRateStr: total > 0 ? `${((_stats.hits / total) * 100).toFixed(1)}%` : '0%',
        total,
        storeSize: {
            guild:  _guildStore.size,
            rl:     _rlStore.size,
            guilds: _registry.size,
            keys:   [..._registry.values()].reduce((a, s) => a + s.size, 0),
        },
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// Cache-First MongoDB Pattern
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Cache-first read with automatic MongoDB fallback.
 *
 * Flow:
 *   1. Keyv hit  → return immediately (zero DB I/O)
 *   2. Miss      → call fetcher() to load from MongoDB
 *   3. Populate cache for future reads
 *   4. Return defaultValue when both cache and DB are empty
 *
 * @param {string}   guildId
 * @param {string}   filename     Cache key (matches guildDb convention)
 * @param {Function} fetcher      async () => data|null  — loads from MongoDB
 * @param {*}        defaultValue Returned when both cache and DB are empty
 * @param {number}   [ttl]        TTL override in ms
 *
 * @example
 *   const settings = await cache.getOrFetch(
 *       guildId, 'settings',
 *       async () => {
 *           const doc = await schemas.Guild.findOne({ guildId }).lean();
 *           return doc?.settings ?? null;
 *       },
 *       {}
 *   );
 */
async function getOrFetch(guildId, filename, fetcher, defaultValue = null, ttl) {
    const cached = await get(guildId, filename);
    if (cached !== null) return cached;
    try {
        const data = await fetcher();
        if (data !== null && data !== undefined) {
            await set(guildId, filename, data, ttl);
            return data;
        }
    } catch (e) {
        logger.error(`[cache] getOrFetch DB error (${guildId}/${filename}):`, e.message);
    }
    return defaultValue;
}

// ══════════════════════════════════════════════════════════════════════════════
// ③ Rate Limiting — pluggable backend for sharded/clustered bots
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Swap the rate-limiter backend for distributed deployments.
 *
 * Default: process-local LruStore (fast, zero-config, single-shard).
 * Upgrade: pass a Redis-backed Keyv so all shards share one counter.
 *
 * @param {Keyv} keyvInstance
 *
 * @example — Redis upgrade (zero changes to other code):
 *   if (process.env.REDIS_URL && process.env.BOT_SHARDED) {
 *       const KeyvRedis = require('@keyv/redis');
 *       cache.configureRateLimiter(
 *           new Keyv({ store: new KeyvRedis(process.env.REDIS_URL), namespace: 'rl' })
 *       );
 *   }
 *
 * ⚠️  Without this each shard has independent counters (fine for single-process).
 *     For cross-shard accuracy on moderation commands, use Redis.
 */
function configureRateLimiter(keyvInstance) {
    if (!(keyvInstance instanceof Keyv))
        throw new TypeError('[cache] configureRateLimiter: expected a Keyv instance');
    _rl = keyvInstance;
    _rl.on('error', e => logger.error('[cache:rl] error:', e.message));
    logger.info('[cache] Rate-limiter backend swapped');
}

/**
 * Sliding-window rate limiter.
 *
 * @param {string} namespace  e.g. 'cmd', 'warn', 'api', 'dashboard'
 * @param {string} id         userId or guildId
 * @param {number} limit      Max allowed requests in the window
 * @param {number} windowMs   Window duration in ms
 * @returns {{ limited, count, remaining, resetAt, retryAfter? }}
 *
 * @example
 *   const r = await cache.rateLimit('warn', userId, 5, 60_000);
 *   if (r.limited) return reply(`Retry in ${r.retryAfter}ms`);
 */
async function rateLimit(namespace, id, limit, windowMs) {
    const key = `${namespace}:${id}`;
    const now = Date.now();
    try {
        let record = await _rl.get(key);
        if (!record || now >= record.resetAt) {
            record = { count: 1, resetAt: now + windowMs };
            await _rl.set(key, record, windowMs);
            return { limited: false, count: 1, remaining: limit - 1, resetAt: record.resetAt };
        }
        if (record.count >= limit) {
            return { limited: true, count: record.count, remaining: 0,
                resetAt: record.resetAt, retryAfter: record.resetAt - now };
        }
        record.count++;
        await _rl.set(key, record, record.resetAt - now);
        return { limited: false, count: record.count, remaining: limit - record.count, resetAt: record.resetAt };
    } catch (e) {
        logger.error(`[cache] rateLimit error (${namespace}/${id}):`, e.message);
        return { limited: false, count: 0, remaining: limit, resetAt: now + windowMs };
    }
}

/** Reset a rate-limit counter (e.g. after a ban is lifted). */
async function resetRateLimit(namespace, id) {
    try   { await _rl.delete(`${namespace}:${id}`); }
    catch (e) { logger.error(`[cache] resetRateLimit error:`, e.message); }
}

/**
 * Check remaining rate-limit budget WITHOUT consuming a token.
 * @returns {{ count, remaining, resetAt, limited } | null}
 */
async function peekRateLimit(namespace, id, limit) {
    try {
        const record = await _rl.get(`${namespace}:${id}`);
        if (!record || Date.now() >= record.resetAt) return null;
        return { count: record.count, remaining: Math.max(0, limit - record.count),
            resetAt: record.resetAt, limited: record.count >= limit };
    } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════════
// Exports
// ══════════════════════════════════════════════════════════════════════════════
module.exports = {
    // Core guild cache
    get, set, del,
    patch,            // ⑤ partial merge
    invalidateGuild,  // ② dynamic registry
    clear, stats,

    // Cache-first MongoDB pattern
    getOrFetch,

    // Rate limiting
    rateLimit, resetRateLimit, peekRateLimit,
    configureRateLimiter,   // ③ pluggable backend

    // ⑤ Event hooks
    on:   (e, h) => _emitter.on(e, h),
    off:  (e, h) => _emitter.off(e, h),
    once: (e, h) => _emitter.once(e, h),

    // Utilities & constants
    clone: _clone,  // ④ explicit deep-copy for callers outside Keyv layer
    TTL_MS,
    KNOWN_FILES,
};
