/*
 * Next Generation — DashboardLog Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores audit log entries for dashboard actions (e.g. settings changes).
 *
 * Design:
 *   • TTL index on `createdAt` auto-deletes records after 90 days.
 *   • `action` describes what changed; `data` stores before/after snapshots.
 */

'use strict';

const { Schema, model } = require('mongoose');

const DashboardLogSchema = new Schema({

    /** Discord guild ID this log entry belongs to */
    guildId: { type: String, required: true },

    /** Discord user ID who performed the action in the dashboard */
    userId: { type: String, default: null },

    /** Short action label (e.g. "settings.update", "protection.toggle") */
    action: { type: String, required: true, maxlength: 100 },

    /** Optional description string */
    description: { type: String, default: '', maxlength: 2000 },

    /** Before/after snapshot or any relevant data */
    data: { type: Schema.Types.Mixed, default: {} },

    /** Request IP address (hashed or omitted for privacy) */
    ip: { type: String, default: null },

}, {
    timestamps: true,
    versionKey: false,
    collection: 'dashboard_logs',
});

// TTL: auto-delete after 90 days
DashboardLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
DashboardLogSchema.index({ guildId: 1, createdAt: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Append a dashboard audit-log entry. Designed for fire-and-forget usage.
 *
 * @param {string} guildId
 * @param {string} userId       Discord user who triggered the action
 * @param {string} action       Short dot-notation label, e.g. 'settings.update'
 * @param {string} [description='']
 * @param {object} [data={}]    Before/after snapshot or any relevant payload
 * @param {string} [ip=null]    Hashed/anonymised request IP (never raw)
 * @returns {Promise<Document>}
 *
 * @example
 *   DashboardLog.log(guildId, userId, 'protection.toggle', 'Enabled anti_ban', { before: false, after: true });
 */
DashboardLogSchema.statics.log = function (guildId, userId, action, description = '', data = {}, ip = null) {
    return this.create({ guildId, userId, action, description, data, ip });
};

/**
 * Fetch the N most recent audit entries for a guild (newest first).
 * @param {number} [limit=50]
 */
DashboardLogSchema.statics.getRecent = function (guildId, limit = 50) {
    return this.find({ guildId }).sort({ createdAt: -1 }).limit(limit).lean();
};

module.exports = model('DashboardLog', DashboardLogSchema);

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */
