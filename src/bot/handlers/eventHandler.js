'use strict';

const { readdirSync } = require('fs');
const path = require('path');

/**
 * Loads all event files from src/bot/events/ and registers them on the client.
 * @param {import('discord.js').Client} client
 */
async function loadEvents(client) {
  const eventsPath = path.join(__dirname, '../events');
  const files = readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const event = require(path.join(eventsPath, file));
    if (event?.name) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      console.log(`  ✅ Loaded event: ${event.name}`);
    }
  }
}

module.exports = loadEvents;
