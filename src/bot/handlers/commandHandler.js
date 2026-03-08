'use strict';

const { readdirSync } = require('fs');
const path = require('path');

/**
 * Recursively loads all command files from src/bot/commands/** and
 * registers them on client.commands (keyed by command name).
 * @param {import('discord.js').Client} client
 */
async function loadCommands(client) {
  const commandsPath = path.join(__dirname, '../commands');
  const categories = readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const files = readdirSync(categoryPath).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      const command = require(path.join(categoryPath, file));
      if (command?.data?.name) {
        client.commands.set(command.data.name, command);
        console.log(`  ✅ Loaded command: ${command.data.name}`);
      }
    }
  }
}

module.exports = loadCommands;
