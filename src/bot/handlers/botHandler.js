'use strict';

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const config = require('../../config/config');
const loadCommands = require('./commandHandler');
const loadEvents = require('./eventHandler');

/**
 * Initialises the Discord client and starts the bot.
 * @returns {Promise<Client>}
 */
async function startBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildModeration,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
  });

  // Attach a commands collection to the client for easy access in handlers
  client.commands = new Collection();

  await loadCommands(client);
  await loadEvents(client);

  await client.login(config.bot.token);
  return client;
}

module.exports = { startBot };
