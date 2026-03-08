'use strict';

const { Events } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,

  /**
   * Handles incoming slash command interactions.
   * @param {import('discord.js').Interaction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`Error executing /${interaction.commandName}:`, error);
      const reply = { content: '❌ An error occurred while executing that command.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
