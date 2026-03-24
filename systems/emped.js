/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */

/**
 * systems/emped.js  —  XState Flow Engine for Embed Messages
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Architecture
 * ─────────────
 *  Each EmbedMessage document stored in MongoDB contains a `machine` field
 *  that is a full XState v4-compatible state machine definition:
 *
 *    machine = {
 *      initial: 'state_0',
 *      states: {
 *        'state_0': {
 *          id, label, color, position,
 *          embeds: [...],
 *          components: [...],
 *          on: {
 *            'btn_customId': { target: 'state_1', actions: ['update_content'] },
 *            'opt_customId': { target: 'state_2', actions: ['send_ephemeral'] },
 *          }
 *        },
 *        'state_1': { ... }
 *      }
 *    }
 *
 *  When a user interacts with a Discord button or select menu:
 *    1. Lookup EmbedMessage by guildId + componentIds index.
 *    2. Read the current state for this Discord message (instanceStates map).
 *    3. Feed the customId event into the XState machine via machine.transition().
 *    4. Retrieve target state + actions from the transition result.
 *    5. Execute each action (edit message, send ephemeral, disable button, etc.).
 *    6. Persist the new state ID back into instanceStates.
 *
 * XState usage
 * ─────────────
 *  We use createMachine() + machine.transition() for pure, stateless computation.
 *  No persistent interpreter / service is kept in memory — every interaction
 *  is a fresh, synchronous transition call.
 *
 * Supported Actions
 * ─────────────────
 *  update_content    → edit the message with the target state's embeds & components
 *  replace_embeds    → replace only the embeds, keep existing components
 *  append_embeds     → prepend initial-state embeds + target state embeds
 *  update_components → replace only the components, keep existing embeds
 *  disable_component → disable the clicked button before editing
 *  send_ephemeral    → send a private ephemeral reply (does NOT edit original msg)
 */

'use strict';

const { MessageFlags,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle }         = require('discord.js');
const logger                  = require('../utils/logger');
const EmbedMessage            = require('./schemas/EmbedMessage');
const { buildDiscordPayload } = require('../dashboard/utils/embedBuilder');

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Compute the next state from a machine definition, current state, and event.
 *
 * Pure JS lookup — no XState runtime needed since we handle actions ourselves.
 *
 * @param {object} machineDef
 * @param {string} currentStateId
 * @param {string} eventId  customId of the triggering component
 * @returns {{ targetStateId: string, actions: string[] } | null}
 */
function _computeTransition(machineDef, currentStateId, eventId) {
    const tr = machineDef.states?.[currentStateId]?.on?.[eventId];
    if (!tr?.target) return null;

    if (!machineDef.states?.[tr.target]) {
        logger.warn('[emped] Transition target state not found', {
            from:        currentStateId,
            event:       eventId,
            target:      tr.target,
            knownStates: Object.keys(machineDef.states || {}),
        });
        return null;
    }

    return { targetStateId: tr.target, actions: tr.actions || [] };
}

/**
 * For a StringSelectMenu interaction, resolve which XState event to fire.
 *
 * Discord gives us:
 *   interaction.customId  → the select menu's customId
 *   interaction.values[0] → the chosen option's `value` field
 *
 * We need to:
 *   1. Find the state that owns this select menu (by matching select.customId).
 *   2. Find the option whose `value === selectedValue`.
 *   3. Return that option's `customId` — which is the XState event name.
 *
 * @param {object} machineDef
 * @param {string} menuCustomId
 * @param {string} selectedValue
 * @returns {{ stateId: string, eventId: string } | null}
 */
function _resolveSelectEvent(machineDef, menuCustomId, selectedValue) {
    for (const [stateId, s] of Object.entries(machineDef.states || {})) {
        for (const row of (s.components || [])) {
            if (row.type !== 'select') continue;
            if (row.select?.customId !== menuCustomId) continue;

            const opt = (row.select.options || []).find(o => o.value === selectedValue);
            if (opt?.customId) return { stateId, eventId: opt.customId };
        }
    }
    return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PIPELINE HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/** Wait N milliseconds. */
const _sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms || 0)));

/** Normalize raw action array: strings → { type } objects (backward compat). */
function _normalizeActions(raw) {
    return (raw || []).map(a => (typeof a === 'string' ? { type: a } : a));
}

/** Immutably patch a button's properties inside a components-rows array. */
function _mutateBtn(components, customId, patch) {
    return components.map(row => {
        if (row.type !== 'buttons') return row;
        const btns = row.buttons || [];
        if (!btns.some(b => b.customId === customId)) return row;
        return { ...row, buttons: btns.map(b => b.customId === customId ? { ...b, ...patch } : b) };
    });
}

/** Remove a component (button or whole select row) by customId. Drops empty button rows. */
function _removeComponent(components, customId) {
    return components.map(row => {
        if (row.type === 'buttons') {
            const filtered = (row.buttons || []).filter(b => b.customId !== customId);
            return filtered.length ? { ...row, buttons: filtered } : null;
        }
        if (row.type === 'select' && row.select?.customId === customId) return null;
        return row;
    }).filter(Boolean);
}

/** Action types that write to the Discord message (used to decide default dirty flag). */
const CONTENT_ACTION_TYPES = new Set([
    'update_content', 'replace_embeds', 'append_embeds', 'update_components',
    'disable_component', 'enable_component', 'hide_component',
]);

/** Per-user cooldown tracker. key = `${docId}:${stateId}:${userId}` → timestamp ms */
const _cooldownMap = new Map();

// ═════════════════════════════════════════════════════════════════════════════
// ACTION EXECUTOR  —  Unlimited Automation Pipeline
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Execute the automation pipeline for a resolved transition.
 *
 * Each action is { type, ...params } (strings are normalized for compat).
 *
 * Supported action types:
 *   update_content       Replace embeds + components with target state (default)
 *   replace_embeds       Replace only embeds, keep components
 *   append_embeds        Prepend initial-state embeds + target embeds
 *   update_components    Replace only components, keep embeds
 *   disable_component    { customId? }              Disable clicked or specific button
 *   enable_component     { customId }               Enable a specific button
 *   hide_component       { customId, duration? }    Hide component; restore after `duration` ms
 *   send_ephemeral                                  Send ephemeral followUp with target state embeds
 *   send_to_channel      { channelId }              Send target embeds to another channel
 *   delay                { ms }                     Wait N ms (flushes pending edit first)
 */

/**
 * Check per-state permissions before executing a transition.
 *
 * Reads `state.permissions = { allowedRoles, cooldown, denyMessage }` from the
 * current state definition.  Flexible — works for any interaction type.
 *
 * @returns {boolean}  true = allowed, false = blocked (already replied to user)
 */
async function _checkPermissions(interaction, doc, currentStateId) {
    const perms = doc.machine?.states?.[currentStateId]?.permissions;
    if (!perms) return true;

    const userId = interaction.user?.id;

    // ── Role check ──────────────────────────────────────────────────────────
    if (perms.allowedRoles?.length) {
        const hasRole = interaction.member?.roles?.cache?.some(
            r => perms.allowedRoles.includes(r.id)
        );
        if (!hasRole) {
            const msg = perms.denyMessage?.trim() || '🚫 You do not have permission to use this.';
            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
            await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
            return false;
        }
    }

    // ── Cooldown check ───────────────────────────────────────────────────────
    if (perms.cooldown > 0 && userId) {
        const key   = `${doc._id}:${currentStateId}:${userId}`;
        const last  = _cooldownMap.get(key) || 0;
        const now   = Date.now();
        const elapsed = (now - last) / 1000;
        if (elapsed < perms.cooldown) {
            const remaining = Math.ceil(perms.cooldown - elapsed);
            const msg = perms.denyMessage?.trim()
                || `⏳ Please wait **${remaining}s** before using this again.`;
            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
            await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
            return false;
        }
        _cooldownMap.set(key, now);
        setTimeout(() => _cooldownMap.delete(key), perms.cooldown * 1000 + 500);
    }

    return true;
}

async function _execute(interaction, doc, currentStateId, targetStateId, rawActions) {
    const machineDef   = doc.machine;
    const initialState = machineDef.states[machineDef.initial] || {};
    const targetState  = machineDef.states[targetStateId];
    if (!targetState) return;

    const actions   = _normalizeActions(rawActions);
    const clickedId = interaction.isButton() ? interaction.customId : null;

    // ACK Discord immediately — always deferUpdate so followUp still works for ephemeral
    if (!interaction.deferred && !interaction.replied)
        await interaction.deferUpdate();

    // Helper: ephemeral messages must be edited via editReply(), not message.edit()
    const _isEphemeral = () => interaction.message?.flags?.has?.(MessageFlags.Ephemeral);
    const _editMsg = p => _isEphemeral() ? interaction.editReply(p) : interaction.message.edit(p);

    // Default context: target state's full content
    const ctx = {
        embeds:     [...(targetState.embeds     || [])],
        components: [...(targetState.components || [])],
        dirty:      actions.some(a => CONTENT_ACTION_TYPES.has(a.type)),
    };

    const restoreSchedules = []; // { ms, docId, channelId, msgId }

    // ── Process each step in the pipeline ────────────────────────────────────
    for (const action of actions) {
        switch (action.type) {

            case 'update_content':
                ctx.embeds     = [...(targetState.embeds     || [])];
                ctx.components = [...(targetState.components || [])];
                ctx.dirty = true;
                break;

            case 'replace_embeds':
                ctx.embeds = [...(targetState.embeds || [])];
                ctx.dirty  = true;
                break;

            case 'append_embeds':
                ctx.embeds = [...(initialState.embeds || []), ...(targetState.embeds || [])];
                ctx.dirty  = true;
                break;

            case 'update_components':
                ctx.components = [...(targetState.components || [])];
                ctx.dirty      = true;
                break;

            case 'disable_component': {
                const cid = action.customId || clickedId;
                if (cid) { ctx.components = _mutateBtn(ctx.components, cid, { disabled: true }); ctx.dirty = true; }
                break;
            }

            case 'enable_component':
                if (action.customId) { ctx.components = _mutateBtn(ctx.components, action.customId, { disabled: false }); ctx.dirty = true; }
                break;

            case 'hide_component': {
                if (!action.customId) break;
                ctx.components = _removeComponent(ctx.components, action.customId);
                ctx.dirty = true;
                if (Number(action.duration) > 0) {
                    restoreSchedules.push({
                        ms:        Number(action.duration),
                        docId:     doc._id,
                        channelId: doc.channelId,
                        msgId:     interaction.message?.id,
                        userId:    interaction.user?.id,
                    });
                }
                break;
            }

            case 'send_ephemeral': {
                const ePayload = buildDiscordPayload({
                    embeds:     targetState.embeds     || [],
                    components: targetState.components || [],
                });
                await interaction.followUp({
                    ...(ePayload.embeds?.length ? ePayload : { content: '(No content configured)' }),
                    flags: MessageFlags.Ephemeral,
                }).catch(e => logger.warn('[emped] followUp failed:', { error: e?.message }));
                break;
            }

            case 'send_to_channel': {
                if (!action.channelId) break;
                const ch = await interaction.client.channels.fetch(action.channelId).catch(() => null);
                if (ch) {
                    const chPayload = buildDiscordPayload({
                        embeds:     targetState.embeds     || [],
                        components: targetState.components || [],
                    });
                    await ch.send(chPayload).catch(e => logger.warn('[emped] send_to_channel failed:', { error: e?.message }));
                }
                break;
            }

            case 'delay': {
                // Flush any pending content edit BEFORE sleeping
                if (ctx.dirty) {
                    const p = buildDiscordPayload({ embeds: ctx.embeds, components: ctx.components });
                    await _editMsg(p)
                        .catch(e => logger.warn('[emped] pre-delay edit failed:', { error: e?.message }));
                    ctx.dirty = false;
                }
                await _sleep(action.ms);
                break;
            }

            default:
                logger.warn('[emped] Unknown action type: "' + action.type + '"');
        }
    }

    // ── Flush final pending content edit ─────────────────────────────────────
    if (ctx.dirty) {
        const payload = buildDiscordPayload({ embeds: ctx.embeds, components: ctx.components });
        await _editMsg(payload)
            .catch(e => logger.warn('[emped] Final edit failed:', { error: e?.message }));
    }

    // ── Schedule component restores (hide_component with duration) ────────────
    for (const { ms, docId, channelId, msgId } of restoreSchedules) {
        setTimeout(async () => {
            try {
                const freshDoc   = await EmbedMessage.findById(docId).lean();
                if (!freshDoc) return;
                // Restore must resolve the per-user key if multiUser is on.
                // We stored userId in the closure via restoreSchedules entry.
                const _rUserId   = restoreSchedules.find(r => r.msgId === msgId)?.userId;
                const _rStateKey = (freshDoc.machine?.multiUser && msgId && _rUserId)
                    ? `${msgId}:${_rUserId}`
                    : msgId;
                const curStateId  = freshDoc.instanceStates?.[_rStateKey] || freshDoc.machine?.initial;
                const curState    = freshDoc.machine?.states?.[curStateId];
                if (!curState) return;
                const restPayload = buildDiscordPayload({
                    embeds:     curState.embeds     || [],
                    components: curState.components || [],
                });
                const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
                const msg     = channel && await channel.messages.fetch(msgId).catch(() => null);
                if (msg) await msg.edit(restPayload);
            } catch (e) {
                logger.warn('[emped] hide_component restore failed:', { error: e?.message });
            }
        }, ms);
    }

    // ── Persist the new instance state for this Discord message ───────────────
    const discordMsgId = interaction.message?.id;
    if (discordMsgId) {
        // Multi-user: key = "msgId:userId"; single-user (default): key = "msgId"
        const userId     = interaction.user?.id;
        const stateKey   = (doc.machine?.multiUser && userId)
            ? `${discordMsgId}:${userId}`
            : discordMsgId;
        EmbedMessage.updateOne(
            { _id: doc._id },
            { $set: { [`instanceStates.${stateKey}`]: targetStateId } }
        ).catch(e => logger.warn('[emped] instanceState save failed:', { error: e?.message }));
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// SMART TRIGGER ENGINE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * In-memory cache of EmbedMessage docs that have smart triggers.
 * TTL: 5 min — or forced zero by invalidateTriggerCache() after a dashboard save.
 */
let _triggerDocs  = [];
let _triggerDocsTs = 0;

/** Export: bust the cache so changes saved via the dashboard take effect immediately. */
function invalidateTriggerCache() { _triggerDocsTs = 0; }

async function _refreshTriggerDocs() {
    try {
        // 'machine.triggers.0' is the most reliable way to check for a non-empty array
        // on a Mixed-type field — avoids the broken $not/$size combo on nested Mixed fields.
        _triggerDocs  = await EmbedMessage.find(
            { 'machine.triggers.0': { $exists: true } }
        ).lean();
        _triggerDocsTs = Date.now();
        logger.info(`[emped] Trigger cache refreshed — ${_triggerDocs.length} doc(s) with triggers`);
    } catch (e) {
        logger.warn('[emped] refreshTriggerDocs failed:', { error: e?.message });
    }
}

async function _ensureTriggerCache() {
    if (Date.now() - _triggerDocsTs > 5 * 60_000) await _refreshTriggerDocs();
}

/**
 * Minimal 5-field cron expression matcher.
 * Supports: * | exact | a-b (range) | a,b (list) | *\/n (step)
 */
function _cronMatches(schedule, date) {
    try {
        const parts = (schedule || '').trim().split(/\s+/);
        if (parts.length !== 5) return false;
        const [cMin, cHour, cDom, cMon, cDow] = parts;
        const check = (pat, val) => {
            if (pat === '*') return true;
            if (/^\d+$/.test(pat)) return +pat === val;
            if (pat.includes(',')) return pat.split(',').some(p => check(p.trim(), val));
            const step  = pat.match(/^\*\/(\d+)$/);   if (step)  return val % +step[1] === 0;
            const range = pat.match(/^(\d+)-(\d+)$/); if (range) return val >= +range[1] && val <= +range[2];
            return false;
        };
        return check(cMin,  date.getMinutes())    &&
               check(cHour, date.getHours())      &&
               check(cDom,  date.getDate())       &&
               check(cMon,  date.getMonth() + 1) &&
               check(cDow,  date.getDay());
    } catch { return false; }
}

/** Default action per trigger type when none is explicitly configured. */
function _defaultTriggerAction(type) {
    if (['member_join', 'role_add', 'role_remove'].includes(type)) return 'send_dm';
    if (type === 'message') return 'send_reply';
    return 'send_to_channel';
}

/**
 * Execute a smart trigger autonomously (no Discord interaction context).
 *
 * Actions:
 *   edit_message    — edit the existing live Discord message to the target state
 *   send_to_channel — send embed to a channel (trigger.channelOverride > doc.channelId)
 *   send_dm         — DM the member (member_join / role_add / role_remove)
 *   send_reply      — reply to the triggering message (message keyword events)
 *
 * @param {import('discord.js').Client} client
 * @param {object} doc     — EmbedMessage lean document
 * @param {object} trigger — one entry from machine.triggers[]
 * @param {object} [ctx]   — { member?, message? }
 */
async function _fireTrigger(client, doc, trigger, ctx = {}) {
    const machine       = doc.machine;
    const targetStateId = trigger.targetState || machine?.initial;
    const targetState   = machine?.states?.[targetStateId];
    if (!targetState) {
        logger.warn('[emped] Smart trigger: targetState not found', { target: trigger.targetState });
        return;
    }
    const payload = buildDiscordPayload({
        embeds:     targetState.embeds     || [],
        components: targetState.components || [],
    });
    const rawActions = (trigger.actions || []).length
        ? trigger.actions
        : [_defaultTriggerAction(trigger.type)];

    for (const act of rawActions) {
        const type   = typeof act === 'string' ? act : act?.type;
        const params = typeof act === 'object'  ? act : {};
        try {
            switch (type) {
                case 'edit_message': {
                    if (!doc.messageId || !doc.channelId) break;
                    const ch  = await client.channels.fetch(doc.channelId).catch(() => null);
                    const msg = ch && await ch.messages.fetch(doc.messageId).catch(() => null);
                    if (!msg) break;
                    await msg.edit(payload);
                    EmbedMessage.updateOne(
                        { _id: doc._id },
                        { $set: { [`instanceStates.${doc.messageId}`]: targetStateId } }
                    ).catch(() => {});
                    break;
                }
                case 'send_to_channel': {
                    const cid = params.channelId || trigger.channelOverride || doc.channelId;
                    if (!cid) break;
                    const ch = await client.channels.fetch(cid).catch(() => null);
                    if (ch) await ch.send(payload);
                    break;
                }
                case 'send_dm': {
                    if (!ctx.member) break;
                    const user = ctx.member.user;
                    if (!user || user.bot) break;
                    // buildDiscordPayload may return an empty object if state has no embeds/components.
                    // Discord rejects empty messages, so fall back to a content string.
                    const hasContent = payload.embeds?.length || payload.components?.length || payload.content;
                    if (!hasContent) {
                        logger.warn('[emped] send_dm: target state has no embeds/components — skipping DM');
                        break;
                    }
                    await user.send(payload);
                    break;
                }
                case 'send_reply': {
                    if (ctx.message) await ctx.message.reply(payload);
                    break;
                }
                default:
                    logger.warn('[emped] Smart trigger: unknown action "' + type + '"');
            }
        } catch (e) {
            logger.warn(`[emped] trigger action "${type}" failed:`, { error: e?.message });
        }
    }
}

/** Runs every 60 s — fires any cron triggers whose schedule matches the current minute. */
async function _cronTick(client) {
    await _ensureTriggerCache();
    const now = new Date();
    for (const doc of _triggerDocs) {
        for (const trigger of (doc.machine?.triggers || [])) {
            if (!trigger.enabled || trigger.type !== 'cron') continue;
            if (_cronMatches(trigger.schedule, now)) {
                _fireTrigger(client, doc, trigger, {})
                    .catch(e => logger.warn('[emped] cron trigger failed:', { error: e?.message }));
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERACTION ROUTER
// ═════════════════════════════════════════════════════════════════════════════

// Guard against duplicate registration on hot-reload / multiple execute() calls
const _registeredClients = new WeakSet();

/**
 * Register the interactionCreate event handler.
 * Loaded automatically by index.js via loadFiles('systems', ...).
 *
 * @param {import('discord.js').Client} client
 */
function registerHandlers(client) {
    if (_registeredClients.has(client)) {
        logger.warn('[EmbedFlow] Handler already registered — skipping duplicate');
        return;
    }
    _registeredClients.add(client);

    // ── Smart Triggers: cron tick every 60 s ─────────────────────────────
    setInterval(() => _cronTick(client), 60_000);

    // ── Smart Triggers: member join ───────────────────────────────────────
    client.on('guildMemberAdd', async member => {
        await _ensureTriggerCache();
        for (const doc of _triggerDocs.filter(d => d.guildId === member.guild.id)) {
            for (const tr of (doc.machine?.triggers || [])) {
                if (!tr.enabled || tr.type !== 'member_join') continue;
                logger.info(`[emped] Firing member_join trigger on doc "${doc.name}" for ${member.user?.tag}`);
                _fireTrigger(client, doc, tr, { member })
                    .catch(e => logger.warn('[emped] member_join trigger failed:', { error: e?.message }));
            }
        }
    });

    // ── Smart Triggers: member leave ──────────────────────────────────────
    client.on('guildMemberRemove', async member => {
        await _ensureTriggerCache();
        for (const doc of _triggerDocs.filter(d => d.guildId === member.guild?.id)) {
            for (const tr of (doc.machine?.triggers || [])) {
                if (!tr.enabled || tr.type !== 'member_leave') continue;
                _fireTrigger(client, doc, tr, { member })
                    .catch(e => logger.warn('[emped] member_leave trigger failed:', { error: e?.message }));
            }
        }
    });

    // ── Smart Triggers: role add / remove ─────────────────────────────────
    client.on('guildMemberUpdate', async (oldM, newM) => {
        const addedRoles   = newM.roles.cache.filter(r => !oldM.roles.cache.has(r.id));
        const removedRoles = oldM.roles.cache.filter(r => !newM.roles.cache.has(r.id));
        if (!addedRoles.size && !removedRoles.size) return;
        await _ensureTriggerCache();
        for (const doc of _triggerDocs.filter(d => d.guildId === newM.guild.id)) {
            for (const tr of (doc.machine?.triggers || [])) {
                if (!tr.enabled) continue;
                if (tr.type === 'role_add'    && tr.roleId && addedRoles.has(tr.roleId))
                    _fireTrigger(client, doc, tr, { member: newM })
                        .catch(e => logger.warn('[emped] role_add trigger failed:', { error: e?.message }));
                if (tr.type === 'role_remove' && tr.roleId && removedRoles.has(tr.roleId))
                    _fireTrigger(client, doc, tr, { member: newM })
                        .catch(e => logger.warn('[emped] role_remove trigger failed:', { error: e?.message }));
            }
        }
    });

    // ── Smart Triggers: message keyword / regex ───────────────────────────
    client.on('messageCreate', async message => {
        if (message.author.bot || !message.guildId) return;
        await _ensureTriggerCache();
        for (const doc of _triggerDocs.filter(d => d.guildId === message.guildId)) {
            for (const tr of (doc.machine?.triggers || [])) {
                if (!tr.enabled || tr.type !== 'message') continue;
                if (tr.channelId && tr.channelId !== message.channelId) continue;
                if (!tr.pattern) continue;
                let matched = false;
                try {
                    matched = tr.isRegex
                        ? new RegExp(tr.pattern, 'i').test(message.content)
                        : message.content.toLowerCase().includes(tr.pattern.toLowerCase());
                } catch { continue; }
                if (matched)
                    _fireTrigger(client, doc, tr, { message })
                        .catch(e => logger.warn('[emped] message trigger failed:', { error: e?.message }));
            }
        }
    });

    client.on('interactionCreate', async interaction => {
        try {
            const guildId = interaction.guildId;
            if (!guildId) return;

            // ── Button ────────────────────────────────────────────────────────
            if (interaction.isButton()) {
                const customId = interaction.customId;

                // Fast lookup via componentIds index
                const doc = await EmbedMessage.findOne({
                    guildId,
                    componentIds: customId,
                }).lean();
                if (!doc?.machine?.states) return; // Not our embed message

                const discordMsgId   = interaction.message?.id;
                const userId         = interaction.user?.id;
                const instanceStates = doc.instanceStates || {};
                // Multi-user: each user has independent state per message
                const stateKey       = (doc.machine?.multiUser && discordMsgId && userId)
                    ? `${discordMsgId}:${userId}`
                    : discordMsgId;
                const currentStateId = (stateKey && instanceStates[stateKey])
                    || doc.machine.initial;

                const result = _computeTransition(doc.machine, currentStateId, customId);
                if (!result) return; // No valid transition from current state

                if (!await _checkPermissions(interaction, doc, currentStateId)) return;

                return await _execute(
                    interaction, doc,
                    currentStateId, result.targetStateId, result.actions
                );
            }

            // ── String Select Menu ────────────────────────────────────────────
            if (interaction.isStringSelectMenu()) {
                const menuCustomId  = interaction.customId;
                const selectedValue = interaction.values?.[0];
                if (!selectedValue) return;

                // Look up by select menu's customId
                const doc = await EmbedMessage.findOne({
                    guildId,
                    componentIds: menuCustomId,
                }).lean();
                if (!doc?.machine?.states) return;

                const discordMsgId   = interaction.message?.id;
                const userId         = interaction.user?.id;
                const instanceStates = doc.instanceStates || {};
                const stateKey       = (doc.machine?.multiUser && discordMsgId && userId)
                    ? `${discordMsgId}:${userId}`
                    : discordMsgId;
                const currentStateId = (stateKey && instanceStates[stateKey])
                    || doc.machine.initial;

                // Map selectedValue → option.customId → XState event
                const resolved = _resolveSelectEvent(doc.machine, menuCustomId, selectedValue);
                if (!resolved) return;

                const result = _computeTransition(doc.machine, currentStateId, resolved.eventId);
                if (!result) return;

                if (!await _checkPermissions(interaction, doc, currentStateId)) return;

                return await _execute(
                    interaction, doc,
                    currentStateId, result.targetStateId, result.actions
                );
            }

        } catch (err) {
            // Ignore expired interactions (user took too long)
            if (err.code === 10062) return;

            logger.error('[emped]', err);

            const errMsg = { content: '❌ An error occurred.', flags: MessageFlags.Ephemeral };
            try {
                if (interaction.replied || interaction.deferred) await interaction.followUp(errMsg);
                else await interaction.reply(errMsg);
            } catch (_) { /* silently ignore ack errors */ }
        }
    });

    logger.info('[EmbedFlow] XState interaction handlers registered ✓');
}

// ═════════════════════════════════════════════════════════════════════════════
// SYSTEM EXPORT  (consumed by index.js loadFiles)
// ═════════════════════════════════════════════════════════════════════════════

module.exports = {
    name: 'emped',
    invalidateTriggerCache,
    execute(client) {
        registerHandlers(client);
    },
};

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */
