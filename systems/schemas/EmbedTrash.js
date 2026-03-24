'use strict';
/*
 * EmbedTrash — recycle bin for deleted EmbedMessages.
 * Documents auto-expire after 30 days via MongoDB TTL index.
 * Restore is possible any time before expiry.
 */
const { Schema, model } = require('mongoose');

const EmbedTrashSchema = new Schema({
    guildId:    { type: String, required: true },
    /** The _id of the original EmbedMessage (before deletion) */
    originalId: { type: String, required: true },
    name:       { type: String, default: '' },
    channelId:  { type: String, default: '' },
    messageId:  { type: String, default: null },
    machine:    { type: Schema.Types.Mixed, default: null },
    epTheme:    { type: Boolean, default: false },
    deletedBy:  { type: String, default: '' },
    /** When null the TTL index won't touch the doc; set to 30 days from deletion */
    expiresAt:  { type: Date },
}, {
    timestamps: true,
    versionKey: false,
    collection: 'embed_trash',
});

/* Auto-purge: MongoDB deletes the doc when current time ≥ expiresAt */
EmbedTrashSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
EmbedTrashSchema.index({ guildId: 1 });

module.exports = model('EmbedTrash', EmbedTrashSchema);
