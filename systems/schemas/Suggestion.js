/*
 * Next Generation — Suggestion Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores community suggestions per guild.
 *
 * Design:
 *   • One document per (guildId, suggId) pair — compound unique index.
 *   • `upvotes` / `downvotes` store Discord user IDs to prevent double-voting.
 *   • `status` tracks the suggestion lifecycle.
 *   • `staffResponse` stores the optional staff reply message.
 */

'use strict';

const { Schema, model } = require('mongoose');

const SuggestionSchema = new Schema({

    /** Discord guild ID */
    guildId: { type: String, required: true },

    /** Unique suggestion ID within the guild (e.g. sequential number or UUID) */
    suggId: { type: String, required: true },

    /** Discord user ID who submitted the suggestion */
    userId: { type: String, required: true },

    /** The suggestion text content */
    content: { type: String, required: true, maxlength: 4000 },

    /** Discord message ID of the suggestion embed in the suggestions channel */
    messageId: { type: String, default: null },

    /** Discord channel ID where the suggestion was posted */
    channelId: { type: String, default: null },

    /** Current lifecycle status */
    status: {
        type: String,
        enum: ['pending', 'approved', 'denied', 'implemented', 'considering'],
        default: 'pending',
    },

    /** Array of user IDs who upvoted */
    upvotes: { type: [String], default: [] },

    /** Array of user IDs who downvoted */
    downvotes: { type: [String], default: [] },

    /** Optional staff response text */
    staffResponse: { type: String, default: null },

    /** Staff member ID who last updated the status */
    respondedBy: { type: String, default: null },

}, {
    timestamps: true,
    versionKey: false,
    collection: 'suggestions',
});

SuggestionSchema.index({ guildId: 1, suggId: 1 }, { unique: true });
SuggestionSchema.index({ guildId: 1, userId: 1 });

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toggle a vote on a suggestion.
 * • Voting the same direction again = un-vote (toggle off).
 * • Switching direction = removes old vote, adds new one — all atomically.
 *
 * @param {'up'|'down'} type
 * @returns {Promise<Document|null>}  null if the suggestion doesn't exist
 */
SuggestionSchema.statics.vote = async function (guildId, suggId, userId, type) {
    const add    = type === 'up' ? 'upvotes'   : 'downvotes';
    const remove = type === 'up' ? 'downvotes' : 'upvotes';
    const item   = await this.findOne({ guildId, suggId }).select(`${add} ${remove}`).lean();
    if (!item) return null;
    const alreadyVoted = item[add].includes(userId);
    const update = alreadyVoted
        ? { $pull:  { [add]: userId } }                                          // un-vote
        : { $addToSet: { [add]: userId }, $pull: { [remove]: userId } };         // switch / new
    return this.findOneAndUpdate({ guildId, suggId }, update, { new: true });
};

/**
 * Add a staff response text and optionally change the suggestion status.
 * @param {'pending'|'approved'|'denied'|'implemented'|'considering'} [newStatus]
 */
SuggestionSchema.statics.respond = function (guildId, suggId, staffId, response, newStatus) {
    const update = { respondedBy: staffId, staffResponse: response };
    if (newStatus) update.status = newStatus;
    return this.findOneAndUpdate({ guildId, suggId }, { $set: update }, { new: true });
};

/**
 * List suggestions for a guild, optionally filtered by status.
 * @param {'pending'|'approved'|'denied'|'implemented'|'considering'} [status]
 */
SuggestionSchema.statics.findByGuild = function (guildId, status, limit = 50) {
    const q = { guildId };
    if (status) q.status = status;
    return this.find(q).sort({ createdAt: -1 }).limit(limit).lean();
};

// ── Virtuals ───────────────────────────────────────────────────────────────────
/** Net vote score: upvotes − downvotes. */
SuggestionSchema.virtual('voteScore').get(function () {
    return (this.upvotes?.length ?? 0) - (this.downvotes?.length ?? 0);
});
/** Total votes cast (up + down). */
SuggestionSchema.virtual('totalVotes').get(function () {
    return (this.upvotes?.length ?? 0) + (this.downvotes?.length ?? 0);
});

module.exports = model('Suggestion', SuggestionSchema);

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */
