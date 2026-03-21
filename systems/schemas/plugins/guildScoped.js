/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Mongoose Plugin — guildScoped                                           │
 * │                                                                           │
 * │  Adds consistent guild-scoped query helpers to any Mongoose model that   │
 * │  carries a `guildId` field. Apply once to get four free statics:         │
 * │                                                                           │
 * │    Model.byGuild(guildId, filter?, opts?)        → documents[]           │
 * │    Model.byGuildPaged(guildId, filter?, opts?)   → { docs, total, pages }│
 * │    Model.countByGuild(guildId, filter?)          → number                │
 * │    Model.deleteByGuild(guildId)                  → DeleteResult           │
 * │                                                                           │
 * │  Usage:                                                                   │
 * │    const guildScoped = require('./plugins/guildScoped');                  │
 * │    MySchema.plugin(guildScoped);                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

'use strict';

/**
 * @param {import('mongoose').Schema} schema
 */
module.exports = function guildScoped(schema) {

    /**
     * Fetch documents for a guild with optional extra filter, sorting, and
     * pagination. Defaults to lean (plain objects). Pass `{ lean: false }` to
     * get Mongoose documents with virtuals/methods.
     *
     * @param {string}  guildId
     * @param {object}  [filter={}]    Merged with `{ guildId }` — add extra conditions here
     * @param {object}  [opts={}]
     * @param {object}  [opts.sort={ createdAt: -1 }]
     * @param {number}  [opts.limit=100]
     * @param {number}  [opts.page=1]     1-based page number (uses skip internally)
     * @param {boolean} [opts.lean=true]  Return plain objects instead of Mongoose docs
     * @returns {Query}
     *
     * @example
     *   const tickets = await Ticket.byGuild(guildId, { status: 'open' });
     *   const page2   = await Ticket.byGuild(guildId, {}, { page: 2, limit: 20 });
     */
    schema.statics.byGuild = function (guildId, filter = {}, opts = {}) {
        const { sort = { createdAt: -1 }, limit = 100, page = 1, lean = true } = opts;
        const skip = (page - 1) * limit;
        const q = this.find({ ...filter, guildId }).sort(sort).limit(limit).skip(skip);
        return lean ? q.lean() : q;
    };

    /**
     * Paginated fetch with total count in a single round-trip via `$facet`.
     * Ideal for dashboard tables that need both data and pagination metadata.
     *
     * @param {string}  guildId
     * @param {object}  [filter={}]
     * @param {object}  [opts={}]
     * @param {object}  [opts.sort={ createdAt: -1 }]
     * @param {number}  [opts.limit=20]
     * @param {number}  [opts.page=1]
     * @returns {Promise<{ docs: object[], total: number, pages: number, page: number }>}
     *
     * @example
     *   const { docs, total, pages } = await Ticket.byGuildPaged(guildId, { status: 'open' }, { page: 3 });
     */
    schema.statics.byGuildPaged = async function (guildId, filter = {}, opts = {}) {
        const { sort = { createdAt: -1 }, limit = 20, page = 1 } = opts;
        const skip = (page - 1) * limit;

        const [res] = await this.aggregate([
            { $match: { guildId, ...filter } },
            {
                $facet: {
                    docs:  [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
                    total: [{ $count: 'n' }],
                },
            },
        ]);

        const total = res.total[0]?.n ?? 0;
        return { docs: res.docs, total, pages: Math.ceil(total / limit) || 1, page };
    };

    /**
     * Count documents for a guild with an optional extra filter.
     *
     * @param {string} guildId
     * @param {object} [filter={}]
     * @returns {Promise<number>}
     *
     * @example
     *   const openCount = await Ticket.countByGuild(guildId, { status: 'open' });
     */
    schema.statics.countByGuild = function (guildId, filter = {}) {
        return this.countDocuments({ guildId, ...filter });
    };

    /**
     * Hard-delete ALL documents for a guild.
     * Intended for guild-leave cleanup flows — use with caution.
     *
     * @param {string} guildId
     * @returns {Promise<import('mongoose').mongo.DeleteResult>}
     *
     * @example
     *   await Promise.all([
     *       Ticket.deleteByGuild(guildId),
     *       Warning.deleteByGuild(guildId),
     *   ]);
     */
    schema.statics.deleteByGuild = function (guildId) {
        return this.deleteMany({ guildId });
    };
};
