'use strict';

const { Schema, model } = require('mongoose');

/**
 * EmbedTemplate — reusable flow snapshots saved by guild admins.
 * Stores the full XState-like machine definition so any flow can be
 * loaded as a starting point for a new EmbedMessage.
 */
module.exports = model('EmbedTemplate', new Schema({
    guildId:     { type: String, required: true, index: true },
    name:        { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 200 },
    machine:     { type: Schema.Types.Mixed, required: true },
    stateCount:  { type: Number, default: 1 },
    createdBy:   { type: String, default: '' },
    createdAt:   { type: Date, default: Date.now },
}, { versionKey: false }));
