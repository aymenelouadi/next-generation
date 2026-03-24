/*
 * Next Generation — EmbedMessage Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores visual automation messages: multiple embeds + components (buttons /
 * select menus) with full nested interaction chains.
 *
 * Design:
 *   • One document per saved message (name + guildId are unique together).
 *   • `embeds`      — ordered array of Discord embed objects.
 *   • `components`  — array of component rows (buttons / select menus).
 *   • `interactions`— map of customId → interaction node (nested responses).
 *   • `epTheme`     — when true all components share one "linked" embed state.
 *   • `messageId` / `channelId` — set after the message is first sent; used
 *     to edit (not resend) the message on subsequent saves.
 */

'use strict';

const { Schema, model } = require('mongoose');

// ── Embed field sub-schema ──────────────────────────────────────────────────
const EmbedFieldSchema = new Schema({
    name:   { type: String, default: '' },
    value:  { type: String, default: '' },
    inline: { type: Boolean, default: false },
}, { _id: false });

// ── Single embed sub-schema ─────────────────────────────────────────────────
const EmbedSchema = new Schema({
    /** Client-side stable ID (uuid-ish string like "emb_0") */
    id:          { type: String, required: true },
    title:       { type: String, default: '' },
    description: { type: String, default: '' },
    color:       { type: String, default: '' },   // hex e.g. "#7c3aed"
    url:         { type: String, default: '' },
    timestamp:   { type: Boolean, default: false },
    author: {
        name:    { type: String, default: '' },
        iconUrl: { type: String, default: '' },
        url:     { type: String, default: '' },
    },
    footer: {
        text:    { type: String, default: '' },
        iconUrl: { type: String, default: '' },
    },
    thumbnail: { type: String, default: '' },
    image:     { type: String, default: '' },
    fields:    { type: [EmbedFieldSchema], default: [] },
}, { _id: false });

// ── Button sub-schema ───────────────────────────────────────────────────────
const ButtonSchema = new Schema({
    customId:  { type: String, required: true },
    label:     { type: String, default: 'Button' },
    style:     { type: String, enum: ['Primary', 'Secondary', 'Success', 'Danger', 'Link'], default: 'Primary' },
    emoji:     { type: String, default: '' },
    url:       { type: String, default: '' },   // only for Link style
    disabled:  { type: Boolean, default: false },
}, { _id: false });

// ── Select menu option sub-schema ───────────────────────────────────────────
const SelectOptionSchema = new Schema({
    customId:    { type: String, required: true },   // unique id for this option's interaction
    label:       { type: String, default: 'Option' },
    value:       { type: String, required: true },
    description: { type: String, default: '' },
    emoji:       { type: String, default: '' },
    default:     { type: Boolean, default: false },
}, { _id: false });

// ── Select menu sub-schema ──────────────────────────────────────────────────
const SelectMenuSchema = new Schema({
    customId:    { type: String, required: true },
    placeholder: { type: String, default: 'Select an option…' },
    minValues:   { type: Number, default: 1 },
    maxValues:   { type: Number, default: 1 },
    disabled:    { type: Boolean, default: false },
    options:     { type: [SelectOptionSchema], default: [] },
}, { _id: false });

// ── Component row sub-schema ────────────────────────────────────────────────
// Each row is either all buttons (up to 5) or one select menu.
const ComponentRowSchema = new Schema({
    id:      { type: String, required: true },   // "row_0", "row_1" etc.
    type:    { type: String, enum: ['buttons', 'select'], required: true },
    buttons: { type: [ButtonSchema], default: [] },
    select:  { type: SelectMenuSchema, default: null },
}, { _id: false });

// ── Interaction node sub-schema ─────────────────────────────────────────────
// Defines what happens when a button / select option is triggered.
// Nested interactions form a tree: each node can reference child nodes by
// their customId stored in the top-level `interactions` map.
const InteractionNodeSchema = new Schema({
    /** The customId that triggers this node */
    customId: { type: String, required: true },

    /** How to modify the message */
    action: {
        type: String,
        enum: [
            'update_embeds',    // replace the message's embed array
            'append_embeds',    // add new embeds to existing ones
            'replace_embed',    // replace a single embed by id
            'show_new_message', // send an ephemeral follow-up
        ],
        default: 'update_embeds',
    },

    /** Embed ids to target (empty = all) when action = replace_embed */
    targetEmbedIds: { type: [String], default: [] },

    /** When epTheme is true, all linked embeds are updated together */
    epTheme: { type: Boolean, default: false },

    /** The embeds to display for this interaction state */
    embeds: { type: [EmbedSchema], default: [] },

    /** The components to display for this interaction state */
    components: { type: [ComponentRowSchema], default: [] },
}, { _id: false });

// ── Root EmbedMessage schema ────────────────────────────────────────────────
const EmbedMessageSchema = new Schema({

    guildId:   { type: String, required: true },

    /** Human-readable name for the dashboard list */
    name:      { type: String, required: true, maxlength: 100 },

    /** Channel where the message lives */
    channelId: { type: String, default: '' },

    /** Discord message ID (set after first send; null = not sent yet) */
    messageId: { type: String, default: null },

    /**
     * When true, all components in this message are "epTheme linked":
     * transitions apply to the whole module together.
     */
    epTheme: { type: Boolean, default: false },

    // ── Legacy fields (kept for backward compat / migration) ──────────────
    embeds:       { type: [EmbedSchema], default: [] },
    components:   { type: [ComponentRowSchema], default: [] },
    interactions: { type: Schema.Types.Mixed, default: {} },

    // ── XState Flow Machine Definition ──────────────────────────────────────
    /**
     * XState-compatible machine definition.
     * Shape:
     *   {
     *     initial: 'stateId',
     *     states: {
     *       [stateId]: {
     *         id: String,
     *         label: String,
     *         color: String,         // hex
     *         position: { x, y },   // canvas position (dashboard)
     *         embeds: [...],
     *         components: [...],
     *         on: {
     *           [customId]: { target: stateId, actions: [String] }
     *         }
     *       }
     *     }
     *   }
     */
    machine: { type: Schema.Types.Mixed, default: null },

    /**
     * Flat index of all button.customId + selectMenu.customId values
     * in this machine.  Used for O(1) lookup when an interaction fires.
     */
    componentIds: { type: [String], default: [] },

    /**
     * Per–Discord-message current state map.
     * Keys are Discord message IDs; values are the stateId the machine
     * is currently in for that message instance.
     * { [discordMessageId]: currentStateId }
     */
    instanceStates: { type: Schema.Types.Mixed, default: {} },

    /** Dashboard creator user id */
    createdBy: { type: String, default: '' },

    /** Last editor */
    updatedBy: { type: String, default: '' },

}, {
    timestamps: true,
    versionKey: false,
    collection: 'embed_messages',
});

EmbedMessageSchema.index({ guildId: 1 });
EmbedMessageSchema.index({ guildId: 1, name: 1 }, { unique: true });
EmbedMessageSchema.index({ guildId: 1, channelId: 1 });

module.exports = model('EmbedMessage', EmbedMessageSchema);

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */
