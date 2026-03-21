/*
 * Next Generation — StaffScore Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks staff member point totals and history per guild.
 *
 * Design:
 *   • One document per (guildId, staffId) pair — compound unique index.
 *   • `history` stores the last 100 point changes using $slice on push.
 *   • Part of the Staff Points system (points_tickets.js).
 */

'use strict';

const { Schema, model } = require('mongoose');

const StaffHistoryEntrySchema = new Schema({
    delta:   { type: Number, required: true },
    reason:  { type: String, default: '' },
    at:      { type: Date,   default: Date.now },
    meta:    { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const StaffScoreSchema = new Schema({

    /** Discord guild ID */
    guildId: { type: String, required: true },

    /** Discord user ID of the staff member */
    staffId: { type: String, required: true },

    /** Current total points balance */
    points: { type: Number, default: 0 },

    /** Rolling history of the last 100 point changes */
    history: {
        type: [StaffHistoryEntrySchema],
        default: [],
    },

    /** Timestamp of the last awarded action (for anti-abuse cooldown) */
    lastActionAt: { type: Date, default: null },

    /** Per-action timestamps map for granular cooldown control */
    lastActions: { type: Schema.Types.Mixed, default: {} },

}, {
    timestamps: true,
    versionKey: false,
    collection: 'staff_scores',
});

StaffScoreSchema.index({ guildId: 1, staffId: 1 }, { unique: true });
StaffScoreSchema.index({ guildId: 1, points: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add or subtract points. Keeps a rolling 100-entry history.
 * @param {string} guildId
 * @param {string} staffId
 * @param {number} delta    Positive to add, negative to subtract
 * @param {string} [reason='']
 * @param {object} [meta={}]   Extra metadata stored in the history entry
 * @returns {Promise<Document>}
 */
StaffScoreSchema.statics.addPoints = function (guildId, staffId, delta, reason = '', meta = {}) {
    return this.findOneAndUpdate(
        { guildId, staffId },
        {
            $inc:  { points: delta },
            $push: { history: { $each: [{ delta, reason, at: new Date(), meta }], $slice: -100 } },
            $set:  { lastActionAt: new Date() },
        },
        { new: true, upsert: true }
    );
};

/** Top N staff members by total points in a guild. */
StaffScoreSchema.statics.getLeaderboard = function (guildId, limit = 10) {
    return this.find({ guildId, points: { $gt: 0 } })
        .sort({ points: -1 })
        .limit(limit)
        .lean();
};

/** Reset a staff member's points balance and clear their full history. */
StaffScoreSchema.statics.resetPoints = function (guildId, staffId) {
    return this.findOneAndUpdate(
        { guildId, staffId },
        { $set: { points: 0, history: [] } },
        { new: true }
    );
};

module.exports = model('StaffScore', StaffScoreSchema);

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */
