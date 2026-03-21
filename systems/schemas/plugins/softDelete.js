/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Mongoose Plugin — softDelete                                            │
 * │                                                                           │
 * │  Adds soft-delete semantics to any schema. Documents are never truly     │
 * │  deleted — they receive a `deletedAt` timestamp and are hidden from      │
 * │  normal queries via `findActive()`.                                       │
 * │                                                                           │
 * │  Added fields:    deletedAt (Date|null)                                   │
 * │  Added virtuals:  isDeleted (boolean)                                    │
 * │  Added instance:  doc.softDelete() · doc.restore()                       │
 * │  Added statics:   Model.findActive(filter) · Model.findDeleted(filter)   │
 * │                                                                           │
 * │  Usage:                                                                   │
 * │    const softDelete = require('./plugins/softDelete');                    │
 * │    MySchema.plugin(softDelete);                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

'use strict';

/**
 * @param {import('mongoose').Schema} schema
 */
module.exports = function softDelete(schema) {

    // ── Add the deletedAt field ───────────────────────────────────────────────
    schema.add({
        /** Null = not deleted. Set to a Date when soft-deleted. */
        deletedAt: { type: Date, default: null },
    });

    // ── Instance methods ──────────────────────────────────────────────────────

    /**
     * Soft-delete this document by stamping `deletedAt = now`.
     * @returns {Promise<this>}
     *
     * @example
     *   const ticket = await Ticket.findOne({ ticketId });
     *   await ticket.softDelete();  // marks as deleted, NOT removed from DB
     */
    schema.methods.softDelete = function () {
        this.deletedAt = new Date();
        return this.save();
    };

    /**
     * Restore a soft-deleted document (set deletedAt = null).
     * @returns {Promise<this>}
     *
     * @example
     *   await ticket.restore();
     */
    schema.methods.restore = function () {
        this.deletedAt = null;
        return this.save();
    };

    // ── Statics ───────────────────────────────────────────────────────────────

    /**
     * Find documents that have NOT been soft-deleted.
     * Merges `{ deletedAt: null }` into the filter automatically.
     *
     * @param {object} [filter={}]
     * @returns {Query}
     *
     * @example
     *   const open = await Ticket.findActive({ guildId, status: 'open' });
     */
    schema.statics.findActive = function (filter = {}) {
        return this.find({ ...filter, deletedAt: null });
    };

    /**
     * Find ONLY soft-deleted documents.
     *
     * @param {object} [filter={}]
     * @returns {Query}
     *
     * @example
     *   const trashed = await Ticket.findDeleted({ guildId });
     */
    schema.statics.findDeleted = function (filter = {}) {
        return this.find({ ...filter, deletedAt: { $ne: null } });
    };

    /**
     * Hard-delete all soft-deleted documents matching filter.
     * Use for scheduled purge jobs.
     *
     * @param {object} [filter={}]
     * @returns {Promise<import('mongoose').mongo.DeleteResult>}
     */
    schema.statics.purgeDeleted = function (filter = {}) {
        return this.deleteMany({ ...filter, deletedAt: { $ne: null } });
    };

    // ── Virtual ───────────────────────────────────────────────────────────────

    /** @returns {boolean} true when this document has been soft-deleted */
    schema.virtual('isDeleted').get(function () {
        return this.deletedAt !== null;
    });
};
