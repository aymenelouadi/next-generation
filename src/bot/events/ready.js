'use strict';

const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,

  /**
   * Fires once when the bot has logged in and is ready.
   * @param {import('discord.js').Client} client
   */
  execute(client) {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`   Serving ${client.guilds.cache.size} guild(s)`);
  },
};
