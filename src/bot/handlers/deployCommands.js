'use strict';

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { readdirSync } = require('fs');
const path = require('path');
const config = require('../../config/config');

/**
 * Collects all slash command data and deploys them to Discord via the REST API.
 * Run with: npm run deploy-commands
 */
async function deployCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, '../commands');
  const categories = readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const files = readdirSync(categoryPath).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const command = require(path.join(categoryPath, file));
      if (command?.data) {
        commands.push(command.data.toJSON());
      }
    }
  }

  const rest = new REST({ version: '10' }).setToken(config.bot.token);

  console.log(`🔄 Deploying ${commands.length} slash command(s)...`);
  await rest.put(Routes.applicationCommands(config.bot.clientId), { body: commands });
  console.log('✅ Slash commands deployed successfully.');
}

deployCommands().catch(console.error);
