/*
 * Next Generation — InteractionScore Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks interaction point totals and history per user per guild.
 *
 * Design:
 *   • One document per (guildId, userId) pair — compound unique index.
 *   • `history` stores the last 100 point changes using $slice on push.
 *   • Part of the Interaction Points system (points_interactions.js).
 */

'use strict';

const { Schema, model } = require('mongoose');

const InteractionHistoryEntrySchema = new Schema({
    delta:   { type: Number, required: true },
    reason:  { type: String, default: '' },
    at:      { type: Date,   default: Date.now },
    meta:    { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const InteractionScoreSchema = new Schema({

    /** Discord guild ID */
    guildId: { type: String, required: true },

    /** Discord user ID */
    userId: { type: String, required: true },

    /** Current total points balance */
    points: { type: Number, default: 0 },

    /** Rolling history of the last 100 point changes */
    history: {
        type: [InteractionHistoryEntrySchema],
        default: [],
    },

    /** Per-event-type cooldown tracking */
    lastActions: { type: Schema.Types.Mixed, default: {} },

}, {
    timestamps: true,
    versionKey: false,
    collection: 'interaction_scores',
});

InteractionScoreSchema.index({ guildId: 1, userId: 1 }, { unique: true });
InteractionScoreSchema.index({ guildId: 1, points: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add or subtract interaction points. Appends to rolling 100-entry history.
 * @param {number} delta    Positive or negative
 * @param {string} [reason='']
 * @param {object} [meta={}]
 * @returns {Promise<Document>}
 */
InteractionScoreSchema.statics.addPoints = function (guildId, userId, delta, reason = '', meta = {}) {
    return this.findOneAndUpdate(
        { guildId, userId },
        {
            $inc:  { points: delta },
            $push: { history: { $each: [{ delta, reason, at: new Date(), meta }], $slice: -100 } },
        },
        { new: true, upsert: true }
    );
};

/** Top N users by interaction points in a guild. */
InteractionScoreSchema.statics.getLeaderboard = function (guildId, limit = 10) {
    return this.find({ guildId, points: { $gt: 0 } })
        .sort({ points: -1 })
        .limit(limit)
        .lean();
};

module.exports = model('InteractionScore', InteractionScoreSchema);

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */
