/*
 * Next Generation — AFK Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores active AFK entries for users.
 *
 * Design:
 *   • One document per userId (global, not per-guild) — matches original behavior.
 *   • TTL index on `timestamp` auto-deletes records after 7 days.
 *   • Sparse unique index on userId for O(1) lookup and upsert.
 */

'use strict';

const { Schema, model } = require('mongoose');

const AFKSchema = new Schema({

    /** Discord user ID — globally unique across guilds */
    userId: { type: String, required: true, unique: true },

    /** The reason the user set for being AFK */
    reason: { type: String, default: 'AFK', maxlength: 500 },

    /** The guild where the AFK was set (informational) */
    guildId: { type: String, default: null },

    /** Timestamp of when the user went AFK — used for TTL and "gone for X time" display */
    timestamp: { type: Date, default: Date.now },

}, {
    timestamps: false,
    versionKey: false,
    collection: 'afk',
});

// TTL index — automatically removes documents 7 days after `timestamp`
AFKSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upsert (or refresh) a user's AFK status.
 * Resets the TTL timer each time it's called.
 */
AFKSchema.statics.setAFK = function (userId, guildId, reason = 'AFK') {
    return this.findOneAndUpdate(
        { userId },
        { $set: { userId, guildId, reason, timestamp: new Date() } },
        { new: true, upsert: true }
    );
};

/** Delete a user's AFK entry (call when they send a message). Returns the removed doc. */
AFKSchema.statics.clearAFK = function (userId) {
    return this.findOneAndDelete({ userId });
};

/** Look up a user's AFK status without side effects. */
AFKSchema.statics.getAFK = function (userId) {
    return this.findOne({ userId }).lean();
};

module.exports = model('AFK', AFKSchema);

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */
