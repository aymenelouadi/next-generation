'use strict';

const { EmbedBuilder } = require('discord.js');

/**
 * Creates a standard embed with project branding.
 * @param {object} options
 * @param {string} [options.title]
 * @param {string} [options.description]
 * @param {number} [options.color=0x5865F2]
 * @returns {EmbedBuilder}
 */
function createEmbed({ title, description, color = 0x5865f2 } = {}) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000);

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Truncates a string to a maximum length, appending '...' if needed.
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(str, maxLength = 100) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

module.exports = { createEmbed, formatDuration, truncate };
