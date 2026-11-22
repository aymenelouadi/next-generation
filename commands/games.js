/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */

const { SlashCommandBuilder } = require('discord.js');
const guard = require('../utils/cmdGuard');

/* ── Components V2 ── */
const CV2 = 1 << 15; // MessageFlags.IsComponentsV2
const C   = { Container: 17, Text: 10, Sep: 14 };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('game')
        .setDescription('Play a game or check game status'),

    textCommand: { name: 'game', aliases: [], hidden: false },

    async execute(client, ctx, args) {
        const isSlash   = ctx.isCommand?.();
        const guildId   = ctx.guild?.id;
        const channelId = isSlash ? ctx.channelId : ctx.channel.id;

        const g = guard.check('game', guildId, channelId, ctx.member ?? null);
        if (!g.ok) return guard.deny(ctx, g.reason);

        if (isSlash) {
            await ctx.reply({ content: '🎮 **Game command received**', flags: 64 });
        } else {
            await ctx.channel.send('🎮 **Game command received**');
        }
    },
};

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */