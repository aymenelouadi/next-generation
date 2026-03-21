/*
 * Next Generation — TicketFeedback Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores exit-survey feedback entries submitted after a ticket is closed.
 *
 * Design:
 *   • One document per feedback submission.
 *   • Compound unique index on (ticketId, userId) enforces the anti-abuse
 *     rule: one rating per user per ticket.
 *   • `claimedById` is denormalized here (copied from the ticket at submission
 *     time) to allow fast staff-performance queries without joining Ticket.
 *   • `panelId` allows panel-level aggregate analytics (avg rating per panel).
 *   • TTL is intentionally NOT applied — feedback is long-term analytics data.
 */

'use strict';

const { Schema, model } = require('mongoose');

const TicketFeedbackSchema = new Schema({

    guildId:  { type: String, required: true },
    ticketId: { type: String, required: true },
    panelId:  { type: String, required: true },

    /** Discord user ID who submitted the rating */
    userId: { type: String, required: true },

    /**
     * Staff member who claimed and handled the ticket.
     * Copied from Ticket.claimedBy at submission time.
     * Null if the ticket was never claimed.
     */
    claimedById: { type: String, default: null },

    /** Star rating: 1 (worst) to 5 (best) */
    rating:  { type: Number, required: true, min: 1, max: 5 },

    /** Optional free-text comment from the exit-survey modal */
    comment: { type: String, default: '' },

    submittedAt: { type: Date, default: Date.now },

}, {
    timestamps: false,
    versionKey: false,
    collection: 'ticket_feedback',
});

// ═══════════════════════════════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════════════════════════════

// Anti-duplicate: one rating per (ticket, user)
TicketFeedbackSchema.index({ ticketId: 1, userId: 1 }, { unique: true });

// Staff performance dashboard: all ratings for a specific staff member
TicketFeedbackSchema.index({ guildId: 1, claimedById: 1, submittedAt: -1 });

// Panel-level analytics: average rating per panel over time
TicketFeedbackSchema.index({ guildId: 1, panelId: 1, submittedAt: -1 });

// Guild-wide feedback list (admin view, sorted by newest)
TicketFeedbackSchema.index({ guildId: 1, submittedAt: -1 });

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upsert a feedback entry. Enforces the unique (ticketId, userId) constraint via upsert.
 * Use instead of `new Model(data).save()` to avoid race-condition duplicates.
 */
TicketFeedbackSchema.statics.submit = function (data) {
    return this.findOneAndUpdate(
        { ticketId: data.ticketId, userId: data.userId },
        { $set: data },
        { new: true, upsert: true }
    );
};

/**
 * Average star rating a staff member received across all closed tickets.
 * @returns {Promise<{ avg: number|null, count: number }>}
 */
TicketFeedbackSchema.statics.avgRatingForStaff = async function (guildId, staffId) {
    const res = await this.aggregate([
        { $match: { guildId, claimedById: staffId } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    return res[0] ?? { avg: null, count: 0 };
};

/**
 * Guild-wide average rating across all staff and panels.
 * @returns {Promise<{ avg: number|null, count: number }>}
 */
TicketFeedbackSchema.statics.avgRatingForGuild = async function (guildId) {
    const res = await this.aggregate([
        { $match: { guildId } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    return res[0] ?? { avg: null, count: 0 };
};

module.exports = model('TicketFeedback', TicketFeedbackSchema);
