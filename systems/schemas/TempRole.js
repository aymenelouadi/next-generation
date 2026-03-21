/*
 * Next Generation — TempRole Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks all active time-limited role assignments.
 *
 * Design:
 *   • One document per (guildId, userId, roleId) assignment.
 *   • `active` flag + `expiresAt` index drives the 30-second expiry checker
 *     that polls for due removals.
 *   • Compound unique index prevents duplicate temp-role docs for the same
 *     (guild, user, role) combination — a new assignment simply overwrites
 *     the existing one via findOneAndUpdate + upsert.
 *   • A TTL index automatically deletes documents 7 days after `expiresAt`
 *     to prevent orphaned records from accumulating (cleanup safety net —
 *     the role itself is removed by the expiry checker long before this fires).
 *
 * NOTE: The TTL index fires AFTER expireAfterSeconds past `expiresAt`,
 * not at `expiresAt` itself. The application expiry-checker (every 30s)
 * is responsible for the actual role removal.
 */

'use strict';

const { Schema, model } = require('mongoose');

const TempRoleSchema = new Schema({

    guildId:    { type: String, required: true },
    userId:     { type: String, required: true },
    roleId:     { type: String, required: true },

    assignedBy: { type: String, required: true },
    assignedAt: { type: Date,   default: Date.now },

    /** Absolute time when the role should be removed */
    expiresAt:  { type: Date,   required: true },

    /** Set to false by the expiry job once the role has been removed */
    active: { type: Boolean, default: true },

}, {
    timestamps: false,
    versionKey: false,
    collection: 'temp_roles',
});

// ═══════════════════════════════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════════════════════════════

// Unique constraint: no duplicate active assignment for same (guild, user, role)
TempRoleSchema.index(
    { guildId: 1, userId: 1, roleId: 1 },
    { unique: true, name: 'temp_role_unique' }
);

// Expiry checker query: { active: true, expiresAt: { $lte: now } }
TempRoleSchema.index(
    { active: 1, expiresAt: 1 },
    { name: 'temp_role_expiry' }
);

// Per-guild list of all temp roles (dashboard and bot startup restore)
TempRoleSchema.index({ guildId: 1, active: 1 });

// TTL safety net: auto-delete orphaned documents 7 days after expiry
TempRoleSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 604800, name: 'temp_role_ttl_cleanup' }
);

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upsert a temp-role assignment. If one already exists for the same
 * (guildId, userId, roleId) it will be updated with the new expiry.
 */
TempRoleSchema.statics.assign = function (guildId, userId, roleId, assignedBy, expiresAt) {
    return this.findOneAndUpdate(
        { guildId, userId, roleId },
        { $set: { assignedBy, expiresAt, active: true, assignedAt: new Date() } },
        { new: true, upsert: true }
    );
};

/**
 * Return all active temp-role records whose expiresAt is in the past.
 * Called by the 30-second expiry-checker job.
 */
TempRoleSchema.statics.getExpired = function () {
    return this.find({ active: true, expiresAt: { $lte: new Date() } }).lean();
};

/** Mark a specific (guild, user, role) assignment as inactive after removal. */
TempRoleSchema.statics.expire = function (guildId, userId, roleId) {
    return this.findOneAndUpdate(
        { guildId, userId, roleId },
        { $set: { active: false } },
        { new: true }
    );
};

/** List all currently active temp-role assignments for a guild (dashboard + restore). */
TempRoleSchema.statics.listByGuild = function (guildId) {
    return this.find({ guildId, active: true }).lean();
};

module.exports = model('TempRole', TempRoleSchema);
