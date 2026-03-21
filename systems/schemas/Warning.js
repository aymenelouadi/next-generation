/*
 * Next Generation — Warning Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores all moderation warning cases per member per guild.
 *
 * Design:
 *   • One document per (guildId, userId) pair — cases are embedded as an array.
 *   • Cases are embedded (not referenced) because:
 *       – They are always read together with the user record.
 *       – Max realistic count per user is << 1000 (fits in one document).
 *       – Single atomic write for warn + count update.
 *   • `totalWarns` is a denormalized count for O(1) "how many warnings" checks
 *     without $size aggregation.
 *   • `caseId` is globally unique (generated as 8-char alphanumeric) and
 *     indexed so moderators can look up a case by ID directly.
 *   • Per-guild scope: each guild manages its members independently.
 */

'use strict';

const { Schema, model } = require('mongoose');

/** Individual warning case */
const WarnCaseSchema = new Schema({
    /** 8-character alphanumeric ID shown to moderators (e.g. "AB3X9KL2") */
    caseId:      { type: String, required: true },
    reason:      { type: String, required: true, maxlength: 1000 },
    moderatorId: { type: String, required: true },
    createdAt:   { type: Date,   default: Date.now },
}, { _id: false });

const WarningSchema = new Schema({

    guildId: { type: String, required: true },
    userId:  { type: String, required: true },

    /** Cached username for display (updated on each warn command) */
    username: { type: String, default: '' },

    /** All warning cases for this user in this guild */
    cases: [WarnCaseSchema],

    /**
     * Denormalized warn count — equals cases.length.
     * Maintained via $inc on push, $dec on pull.
     * Allows instant "total warns" read without array length calculations.
     */
    totalWarns: { type: Number, default: 0, min: 0 },

}, {
    timestamps: true,
    versionKey: false,
    collection: 'warnings',
});

// ═══════════════════════════════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════════════════════════════

// Primary: per-guild per-user warning record
WarningSchema.index({ guildId: 1, userId: 1 }, { unique: true });

// Case ID lookup: /case <id> command — globally unique case IDs
WarningSchema.index(
    { 'cases.caseId': 1 },
    { unique: true, sparse: true, name: 'warn_case_id_unique' }
);

// Moderator audit: list all warnings issued by a specific mod in a guild
WarningSchema.index({ guildId: 1, 'cases.moderatorId': 1 });

// Progressive-punishment queries: users with >= N warnings
WarningSchema.index({ guildId: 1, totalWarns: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add a warning case atomically. Increments totalWarns.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} username
 * @param {{ caseId: string, reason: string, moderatorId: string }} caseData
 * @returns {Promise<Document>}
 */
WarningSchema.statics.addCase = async function (guildId, userId, username, caseData) {
    return this.findOneAndUpdate(
        { guildId, userId },
        {
            $set:   { username },
            $push:  { cases: { ...caseData, createdAt: new Date() } },
            $inc:   { totalWarns: 1 },
        },
        { new: true, upsert: true }
    );
};

/**
 * Remove a warning case by caseId atomically. Decrements totalWarns.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} caseId
 * @returns {Promise<Document|null>}
 */
WarningSchema.statics.removeCase = async function (guildId, userId, caseId) {
    return this.findOneAndUpdate(
        { guildId, userId },
        {
            $pull: { cases: { caseId } },
            $inc:  { totalWarns: -1 },
        },
        { new: true }
    );
};

/** Reset all warnings for a user in a guild (zero cases + zero count). */
WarningSchema.statics.clearAll = function (guildId, userId) {
    return this.findOneAndUpdate(
        { guildId, userId },
        { $set: { cases: [], totalWarns: 0 } },
        { new: true }
    );
};

/**
 * Count how many cases a specific moderator has issued in a guild.
 * @returns {Promise<number>}
 */
WarningSchema.statics.countByMod = async function (guildId, moderatorId) {
    const res = await this.aggregate([
        { $match: { guildId } },
        { $unwind: '$cases' },
        { $match: { 'cases.moderatorId': moderatorId } },
        { $count: 'total' },
    ]);
    return res[0]?.total ?? 0;
};

/**
 * Fetch the top N most-warned users in a guild.
 * Useful for progressive-punishment dashboards.
 * @param {number} [limit=10]
 */
WarningSchema.statics.getTopOffenders = function (guildId, limit = 10) {
    return this.find({ guildId, totalWarns: { $gt: 0 } })
        .sort({ totalWarns: -1 })
        .limit(limit)
        .lean();
};

// ── Virtual ───────────────────────────────────────────────────────────────────
/** true when this user has at least one active warning. */
WarningSchema.virtual('hasWarnings').get(function () { return this.totalWarns > 0; });

// ── Hook ──────────────────────────────────────────────────────────────────────
// Floor totalWarns at 0 — guards against removeCase being called when the count
// is already 0 (e.g. manual DB edits or concurrent requests).
WarningSchema.post('findOneAndUpdate', async function (doc) {
    if (doc && typeof doc.totalWarns === 'number' && doc.totalWarns < 0) {
        await doc.constructor.updateOne({ _id: doc._id }, { $set: { totalWarns: 0 } });
    }
});

module.exports = model('Warning', WarningSchema);
