'use strict';
/*
 * EmbedVersion — version snapshot for a saved EmbedMessage machine.
 * Auto-created on every save (max 10 per doc). Manual snapshots have
 * autoSave = false and a user-supplied label.
 */
const { Schema, model } = require('mongoose');

const EmbedVersionSchema = new Schema({
    /** Parent guild */
    guildId:     { type: String, required: true },
    /** EmbedMessage._id (string) */
    docId:       { type: String, required: true },
    /** Sequential number: 1, 2, 3 … */
    version:     { type: Number, required: true },
    /** Optional user label (manual snapshots only) */
    label:       { type: String, default: '' },
    /** Name of the parent doc at time of snapshot */
    machineName: { type: String, default: '' },
    /** Full copy of machine definition */
    machine:     { type: Schema.Types.Mixed },
    /** User ID who triggered the save */
    savedBy:     { type: String, default: '' },
    /** true = triggered automatically on save; false = manual */
    autoSave:    { type: Boolean, default: true },
}, {
    timestamps:  true,
    versionKey:  false,
    collection:  'embed_versions',
});

EmbedVersionSchema.index({ docId: 1, version: -1 });
EmbedVersionSchema.index({ guildId: 1 });

module.exports = model('EmbedVersion', EmbedVersionSchema);
