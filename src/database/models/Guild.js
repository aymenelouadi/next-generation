'use strict';

const mongoose = require('mongoose');

/**
 * Guild configuration schema.
 * Stores per-guild settings such as prefix, mod-log channel, and welcome channel.
 */
const guildSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
    },
    prefix: {
      type: String,
      default: '!',
    },
    modLogChannel: {
      type: String,
      default: null,
    },
    welcomeChannel: {
      type: String,
      default: null,
    },
    welcomeMessage: {
      type: String,
      default: 'Welcome {user} to {server}!',
    },
    autoRoles: {
      type: [String],
      default: [],
    },
    disabledCommands: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Guild', guildSchema);
