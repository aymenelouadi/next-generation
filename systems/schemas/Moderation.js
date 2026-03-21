/*
 * Next Generation — Moderation Schema (Jail + Mute)
 * ─────────────────────────────────────────────────────────────────────────────
 * Two collections:
 *
 *   jails  — members currently jailed (role-restricted access)
 *   mutes  — members currently muted (Discord timeout or role-based)
 *
 * Design:
 *   • Separate collections for Jail and Mute because their fields and
 *     lifecycle differ (savedRoles for jail, duration types for mute).
 *   • `active` flag for soft queries — easier than deleting documents
 *     immediately so history is preserved for audit.
 *   • `expiresAt` is sparse-indexed to support an expiry-checker job that
 *     queries `{ active: true, expiresAt: { $lte: now } }` efficiently.
 *   • `savedRoles` stores the member's roles before jailing so they can be
 *     restored exactly on unjail.
 *   • `caseId` is unique per record for cross-referencing with Warning cases.
 */

'use strict';

const { Schema, model } = require('mongoose');

// ═══════════════════════════════════════════════════════════════════════════════
// JAIL
// ═══════════════════════════════════════════════════════════════════════════════

const JailSchema = new Schema({

    guildId:     { type: String, required: true },
    userId:      { type: String, required: true },

    reason:      { type: String, default: '' },
    moderatorId: { type: String, required: true },
    /** 8-char case ID (matches warn.js genCaseId format) */
    caseId:      { type: String, required: true },

    /** The jail role ID applied to the member */
    jailRoleId:  { type: String, required: true },

    /**
     * Snapshot of the member's roles at the moment of jailing.
     * Restored by the unjail command.
     */
    savedRoles:  [{ type: String }],

    jailedAt:   { type: Date, default: Date.now },
    /** null = permanent jail */
    expiresAt:  { type: Date, default: null },

    /** false once the member is unjailed (or the expiry job removes the role) */
    active: { type: Boolean, default: true },

}, {
    timestamps: true,
    versionKey: false,
    collection: 'jails',
});

// Primary: look up active jail for a specific user in a guild
JailSchema.index({ guildId: 1, userId: 1, active: 1 });

// Expiry job: find all active, expired jails
JailSchema.index(
    { active: 1, expiresAt: 1 },
    { sparse: true, name: 'jail_expiry_checker' }
);

// Case ID lookup for audit
JailSchema.index({ caseId: 1 }, { unique: true, sparse: true });

// ═══════════════════════════════════════════════════════════════════════════════
// MUTE
// ═══════════════════════════════════════════════════════════════════════════════

const MuteSchema = new Schema({

    guildId:     { type: String, required: true },
    userId:      { type: String, required: true },

    reason:      { type: String, default: '' },
    moderatorId: { type: String, required: true },
    caseId:      { type: String, required: true },

    /**
     * type of mute applied:
     *   'timeout' — Discord native timeout (communicationDisabledUntil)
     *   'role'    — manual mute role assignment
     */
    muteType: {
        type:    String,
        enum:    ['timeout', 'role'],
        default: 'timeout',
    },

    /** Duration in milliseconds. null = permanent */
    duration:  { type: Number, default: null, min: 0 },

    mutedAt:   { type: Date, default: Date.now },
    /** null = permanent */
    expiresAt: { type: Date, default: null },

    active: { type: Boolean, default: true },

}, {
    timestamps: true,
    versionKey: false,
    collection: 'mutes',
});

// Primary: look up active mute for a user in a guild
MuteSchema.index({ guildId: 1, userId: 1, active: 1 });

// Expiry job: find all active, expired mutes
MuteSchema.index(
    { active: 1, expiresAt: 1 },
    { sparse: true, name: 'mute_expiry_checker' }
);

// Case ID lookup
MuteSchema.index({ caseId: 1 }, { unique: true, sparse: true });

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS — JAIL
// ═══════════════════════════════════════════════════════════════════════════════

/** Create a new jail record (convenience wrapper around `new Model().save()`). */
JailSchema.statics.createRecord = function (data) {
    return new this(data).save();
};

/** Mark the currently active jail for a user as ended. */
JailSchema.statics.end = function (guildId, userId) {
    return this.findOneAndUpdate(
        { guildId, userId, active: true },
        { $set: { active: false } },
        { new: true }
    );
};

/** Find the currently active jail for a user, or null if not jailed. */
JailSchema.statics.findActive = function (guildId, userId) {
    return this.findOne({ guildId, userId, active: true }).lean();
};

/** Return all active jails whose expiresAt has elapsed (for the expiry-checker job). */
JailSchema.statics.getExpired = function () {
    return this.find({ active: true, expiresAt: { $lte: new Date(), $ne: null } }).lean();
};

/** true when this jail has a non-null expiresAt that is in the past. */
JailSchema.virtual('isExpired').get(function () {
    return !!this.expiresAt && new Date() > new Date(this.expiresAt);
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS — MUTE
// ═══════════════════════════════════════════════════════════════════════════════

/** Create a new mute record. */
MuteSchema.statics.createRecord = function (data) {
    return new this(data).save();
};

/** Mark the currently active mute for a user as ended. */
MuteSchema.statics.end = function (guildId, userId) {
    return this.findOneAndUpdate(
        { guildId, userId, active: true },
        { $set: { active: false } },
        { new: true }
    );
};

/** Find the currently active mute for a user, or null. */
MuteSchema.statics.findActive = function (guildId, userId) {
    return this.findOne({ guildId, userId, active: true }).lean();
};

/** Return all active mutes whose expiresAt has elapsed. */
MuteSchema.statics.getExpired = function () {
    return this.find({ active: true, expiresAt: { $lte: new Date(), $ne: null } }).lean();
};

/** true when this mute has a non-null expiresAt that is in the past. */
MuteSchema.virtual('isExpired').get(function () {
    return !!this.expiresAt && new Date() > new Date(this.expiresAt);
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

const Jail = model('Jail', JailSchema);
const Mute = model('Mute', MuteSchema);

module.exports = { Jail, Mute };
