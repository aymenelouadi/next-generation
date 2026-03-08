/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */

const {
    SlashCommandBuilder, PermissionFlagsBits,
    EmbedBuilder, ActionRowBuilder,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ButtonBuilder, ButtonStyle
} = require('discord.js');
const fs   = require('fs');
const path = require('path');
const adminGuard = require('../utils/adminGuard.js');
const { langOf, t } = require('../utils/cmdLang.js');
const logSystem  = require('../systems/log.js');

const CV2 = 1 << 15;
const C   = { Container: 17, Text: 10 };

function errCard(lines) {
    return { flags: CV2, components: [{ type: C.Container, accent_color: 0xef4444,
        components: [{ type: C.Text, content: lines.join('\n') }] }] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_perm')
        .setDescription('Manage command permissions')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    textCommand: { name: 'setperm', aliases: ['set_perm'] },

    async execute(client, ctx, args) {
        const isSlash = ctx.isCommand?.();
        const guild   = ctx.guild;
        const lang    = langOf(guild?.id);
        if (!guild) return;

        const guard = await adminGuard.check('set_perm', guild.id, ctx.channel || ctx.channelId, ctx.member);
        if (!guard.ok) return adminGuard.deny(ctx, guard.reason);

        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

        const adminCommands = Object.entries(settings.actions)
            .filter(([_, cmd]) => cmd.admin === true)
            .map(([key, cmd]) => ({
                id: key, name: cmd.label || key,
                emoji: cmd.emoji || '', roles: cmd.rolesAllowed || []
            }));

        if (!adminCommands.length) {
            const err = errCard([`❌  ${t(lang,'set_perm.no_commands')}`]);
            return isSlash ? ctx.reply({ ...err, ephemeral: true }) : ctx.channel.send(err);
        }

        await this.showCommandMenu(ctx, adminCommands, 0, isSlash);

        if (guard.cfg?.log !== false) {
            const author = isSlash ? ctx.user : ctx.author;
            await logSystem.logCommandUsage({
                interaction: ctx, commandName: 'set_perm', moderator: author,
                target: author, reason: 'Opened permission manager', action: 'SET_PERM'
            }).catch(() => {});
        }
    },

    async showCommandMenu(context, commands, page = 0, isSlash) {
        const PER = 25;
        const start = page * PER;
        const paginated = commands.slice(start, start + PER);
        const totalPages = Math.ceil(commands.length / PER);

        const select = new StringSelectMenuBuilder()
            .setCustomId(`perm_select_${page}`)
            .setPlaceholder('Select a command to edit its roles')
            .setMinValues(1).setMaxValues(1);

        paginated.forEach(cmd => {
            const opt = new StringSelectMenuOptionBuilder()
                .setLabel(cmd.name).setValue(cmd.id)
                .setDescription(`Allowed roles: ${cmd.roles.length || 'everyone'}`);
            if (cmd.emoji) opt.setEmoji(cmd.emoji);
            select.addOptions(opt);
        });

        const rows = [new ActionRowBuilder().addComponents(select)];

        if (commands.length > PER) {
            const navRow = new ActionRowBuilder();
            if (page > 0) navRow.addComponents(
                new ButtonBuilder().setCustomId(`perm_prev_${page}`).setLabel('◀').setStyle(ButtonStyle.Secondary)
            );
            navRow.addComponents(
                new ButtonBuilder().setCustomId(`perm_page_${page}`).setLabel(`${page+1}/${totalPages}`).setStyle(ButtonStyle.Success).setDisabled(true)
            );
            if (page < totalPages - 1) navRow.addComponents(
                new ButtonBuilder().setCustomId(`perm_next_${page}`).setLabel('▶').setStyle(ButtonStyle.Secondary)
            );
            rows.push(navRow);
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('Command Permission Manager')
            .setDescription(`Select a command to manage its allowed roles.\n**Commands:** ${commands.length}`)
            .setFooter({ text: `Page ${page+1}/${totalPages}` });

        const payload = { embeds: [embed], components: rows };

        if (isSlash) {
            if (context.replied || context.deferred) await context.editReply(payload);
            else await context.reply({ ...payload, ephemeral: true });
        } else {
            await context.reply(payload);
        }
    },

    async showRoleActions(interaction, commandId) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const command = settings.actions[commandId];
        const currentRoles = command.rolesAllowed || [];

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(command.label || commandId)
            .setDescription(`**Allowed roles:** ${currentRoles.length ? currentRoles.map(id => `<@&${id}>`).join(', ') : 'Everyone (no restriction)'}`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`perm_add_${commandId}`).setLabel('Add Role').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`perm_remove_${commandId}`).setLabel('Remove Role').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`perm_back_${commandId}`).setLabel('← Back').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [row] });
    },

    async showRoleSelection(interaction, commandId, action) {
        const guild = interaction.guild;
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const currentRoles = settings.actions[commandId].rolesAllowed || [];

        const allRoles = guild.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position);
        const available = action === 'remove'
            ? [...allRoles.filter(r => currentRoles.includes(r.id)).values()]
            : [...allRoles.filter(r => !currentRoles.includes(r.id)).values()];

        if (!available.length) {
            await interaction.reply({
                content: action === 'remove' ? 'No roles to remove.' : 'All roles already added.',
                ephemeral: true
            });
            return;
        }
        await this.showPaginatedRoleMenu(interaction, commandId, action, available, 0);
    },

    async showPaginatedRoleMenu(interaction, commandId, action, rolesList, page = 0) {
        const PER = 25;
        const paginated = rolesList.slice(page * PER, (page + 1) * PER);
        const totalPages = Math.ceil(rolesList.length / PER);

        const select = new StringSelectMenuBuilder()
            .setCustomId(`perm_role_${commandId}_${action}_${page}`)
            .setPlaceholder(action === 'add' ? 'Select role to add' : 'Select role to remove')
            .setMinValues(1).setMaxValues(1);

        paginated.forEach(role => select.addOptions(
            new StringSelectMenuOptionBuilder().setLabel(role.name).setValue(role.id).setDescription(`@${role.name}`)
        ));

        const rows = [new ActionRowBuilder().addComponents(select)];

        if (rolesList.length > PER) {
            const navRow = new ActionRowBuilder();
            if (page > 0) navRow.addComponents(
                new ButtonBuilder().setCustomId(`perm_role_page_${commandId}_${action}_prev_${page}`).setLabel('◀').setStyle(ButtonStyle.Secondary)
            );
            navRow.addComponents(
                new ButtonBuilder().setCustomId(`perm_role_page_${commandId}_${action}_current`).setLabel(`${page+1}/${totalPages}`).setStyle(ButtonStyle.Success).setDisabled(true)
            );
            if (page < totalPages - 1) navRow.addComponents(
                new ButtonBuilder().setCustomId(`perm_role_page_${commandId}_${action}_next_${page}`).setLabel('▶').setStyle(ButtonStyle.Secondary)
            );
            rows.push(navRow);
        }

        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`perm_back_${commandId}`).setLabel('← Back').setStyle(ButtonStyle.Secondary)
        ));

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(action === 'add' ? 'Add Role' : 'Remove Role')
            .setDescription(`Page ${page+1}/${totalPages}`);

        await interaction.update({ embeds: [embed], components: rows });
    },

    async updateCommandRoles(commandId, roleId, action) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (!settings.actions[commandId].rolesAllowed) settings.actions[commandId].rolesAllowed = [];
        if (action === 'add') {
            if (!settings.actions[commandId].rolesAllowed.includes(roleId))
                settings.actions[commandId].rolesAllowed.push(roleId);
        } else {
            settings.actions[commandId].rolesAllowed = settings.actions[commandId].rolesAllowed.filter(id => id !== roleId);
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
        return settings.actions[commandId].rolesAllowed;
    },

    async handleButton(interaction) {
        const id = interaction.customId;
        const settingsPath = path.join(__dirname, '../settings.json');

        const getAdminCmds = () => {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            return Object.entries(settings.actions)
                .filter(([_, cmd]) => cmd.admin === true)
                .map(([key, cmd]) => ({ id: key, name: cmd.label || key, emoji: cmd.emoji || '', roles: cmd.rolesAllowed || [] }));
        };

        if (id.startsWith('perm_prev_')) {
            const page = parseInt(id.split('_')[2]);
            await this.showCommandMenu(interaction, getAdminCmds(), page - 1, true);
        } else if (id.startsWith('perm_next_')) {
            const page = parseInt(id.split('_')[2]);
            await this.showCommandMenu(interaction, getAdminCmds(), page + 1, true);
        } else if (id.startsWith('perm_back_')) {
            await this.showCommandMenu(interaction, getAdminCmds(), 0, true);
        } else if (id.startsWith('perm_add_')) {
            const commandId = id.slice('perm_add_'.length);
            await this.showRoleSelection(interaction, commandId, 'add');
        } else if (id.startsWith('perm_remove_')) {
            const commandId = id.slice('perm_remove_'.length);
            await this.showRoleSelection(interaction, commandId, 'remove');
        } else if (id.startsWith('perm_role_page_')) {
            const parts = id.split('_');
            // perm_role_page_{commandId}_{action}_{dir}_{page}
            const commandId = parts[3];
            const action    = parts[4];
            const dir       = parts[5];
            const page      = parseInt(parts[6]);
            const settings  = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const currentRoles = settings.actions[commandId].rolesAllowed || [];
            const allRoles = interaction.guild.roles.cache.filter(r => r.id !== interaction.guild.id).sort((a, b) => b.position - a.position);
            const available = action === 'remove'
                ? [...allRoles.filter(r => currentRoles.includes(r.id)).values()]
                : [...allRoles.filter(r => !currentRoles.includes(r.id)).values()];
            const newPage = dir === 'prev' ? page - 1 : page + 1;
            await this.showPaginatedRoleMenu(interaction, commandId, action, available, newPage);
        }
    },

    async handleSelectMenu(interaction) {
        const id = interaction.customId;

        if (id.startsWith('perm_select_')) {
            const commandId = interaction.values[0];
            await this.showRoleActions(interaction, commandId);
        } else if (id.startsWith('perm_role_')) {
            // perm_role_{commandId}_{action}_{page}
            const parts = id.split('_');
            const commandId = parts[2];
            const action    = parts[3];
            const roleId    = interaction.values[0];
            await this.updateCommandRoles(commandId, roleId, action);
            const role = interaction.guild.roles.cache.get(roleId);
            const actionText = action === 'add' ? 'Added' : 'Removed';
            await interaction.reply({ content: `✅  ${actionText} role **${role?.name ?? roleId}** successfully.`, ephemeral: true });
            await this.showRoleActions(interaction, commandId);
        }
    }
};


/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */