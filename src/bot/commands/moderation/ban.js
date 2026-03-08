'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option.setName('target').setDescription('The member to ban').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the ban').setRequired(false)
    ),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const target = interaction.options.getMember('target');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target) {
      return interaction.reply({ content: '❌ Could not find that member.', ephemeral: true });
    }

    if (!target.bannable) {
      return interaction.reply({
        content: '❌ I cannot ban this member. They may have a higher role than me.',
        ephemeral: true,
      });
    }

    await target.ban({ reason });

    const embed = new EmbedBuilder()
      .setTitle('🔨 Member Banned')
      .setColor(0xff0000)
      .addFields(
        { name: 'Member', value: `${target.user.tag}`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
