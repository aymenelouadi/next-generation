/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */

const { SlashCommandBuilder, PermissionFlagsBits, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, RoleSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logSystem  = require('../systems/log.js');
const adminGuard = require('../utils/adminGuard.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('actions_role_mute')
        .setDescription('ادارة رتبة الميوت')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    textCommand: {
        name: 'arm',
        aliases: []
    },

    async execute(client, interactionOrMessage, args) {
        const isSlash = interactionOrMessage.isCommand?.();
        
        try {
            const guild = interactionOrMessage.guild;
        if (!guild) return;

        const guard = await adminGuard.check('actions_role_mute', guild.id, interactionOrMessage.channel || interactionOrMessage.channelId, interactionOrMessage.member);
        if (!guard.ok) return adminGuard.deny(interactionOrMessage, guard.reason);

        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const commandConfig = settings.actions['actions_role_mute'];

            const muteCommand = settings.actions.mute;
            if (!muteCommand) {
                return this.sendResponse(interactionOrMessage, 'أمر mute غير موجود في الإعدادات', isSlash);
            }

            if (commandConfig.log) {
                const moderator = interactionOrMessage.user || interactionOrMessage.author;
                await logSystem.logCommandUsage({
                    interaction: interactionOrMessage,
                    commandName: commandName,
                    moderator: moderator,
                    target: moderator,
                    reason: 'فتح قائمة ادارة رتبة الميوت',
                    action: commandName
                });
            }

            const muteRole = muteCommand.muteRole || '';
            
            await this.showMainMenu(interactionOrMessage, muteRole, isSlash);

        } catch (error) {
            console.error(`Error in actions_role_mute:`, error);
            return this.sendResponse(interactionOrMessage, 'حدث خطأ', isSlash);
        }
    },


    async showMainMenu(context, currentRoleId, isSlash) {
        const currentRole = currentRoleId ? context.guild?.roles.cache.get(currentRoleId) : null;

        const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('ادارة رتبة الميوت')
            .setDescription('الرتبة التي تعطى للاعضاء عند كتمهم')
            .addFields(
                { name: 'الرتبة الحالية', value: currentRole ? `${currentRole.name} (${currentRoleId})` : 'لا توجد رتبة محددة' }
            )
            .setFooter({ text: 'اختر الإجراء المناسب' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('mute_role_set')
                    .setLabel('تعيين رتبة')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('mute_role_remove')
                    .setLabel('ازالة الرتبة')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!currentRoleId)
            );

        if (context.isButton?.() || context.isRoleSelectMenu?.()) {
            await context.update({ embeds: [embed], components: [row] });
        } else if (isSlash) {
            if (context.replied || context.deferred) {
                await context.editReply({ embeds: [embed], components: [row] });
            } else {
                await context.reply({ embeds: [embed], components: [row], ephemeral: true });
            }
        } else {
            await context.reply({ embeds: [embed], components: [row] });
        }
    },

    async showRoleSelector(interaction) {
        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('mute_role_select')
            .setPlaceholder('اختر الرتبة المراد تعيينها للميوت')
            .setMinValues(1)
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(roleSelect);

        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('mute_role_back')
                    .setLabel('رجوع')
                    .setStyle(ButtonStyle.Secondary)
            );

        const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('تعيين رتبة الميوت')
            .setDescription('اختر الرتبة التي ستعطى للاعضاء عند كتمهم');

        await interaction.update({ embeds: [embed], components: [row, backButton] });
    },

    async updateMuteRole(interaction, roleId) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

        settings.actions.mute.muteRole = roleId;

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));

        const role = interaction.guild?.roles.cache.get(roleId);
        return {
            success: true,
            message: `تم تعيين رتبة الميوت الى: ${role ? role.name : roleId}`,
            role: role
        };
    },

    async removeMuteRole(interaction) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

        const oldRoleId = settings.actions.mute.muteRole;
        settings.actions.mute.muteRole = '';

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));

        const oldRole = oldRoleId ? interaction.guild?.roles.cache.get(oldRoleId) : null;
        return {
            success: true,
            message: oldRole ? `تم ازالة رتبة الميوت: ${oldRole.name}` : 'تم ازالة رتبة الميوت',
            role: oldRole
        };
    },

    async handleButton(interaction) {
        const customId = interaction.customId;
        const commandConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8')).actions['actions_role_mute'];

        if (customId === 'mute_role_set') {
            await this.showRoleSelector(interaction);
        }
        else if (customId === 'mute_role_remove') {
            const result = await this.removeMuteRole(interaction);
            
            if (commandConfig?.log) {
                await logSystem.logCommandUsage({
                    interaction: interaction,
                    commandName: 'actions_role_mute',
                    moderator: interaction.user,
                    target: interaction.user,
                    reason: `ازالة رتبة الميوت`,
                    action: 'actions_role_mute'
                });
            }
            
            await this.showMainMenu(interaction, '');
        }
        else if (customId === 'mute_role_back') {
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            await this.showMainMenu(interaction, settings.actions.mute.muteRole || '');
        }
    },

    async handleRoleSelect(interaction) {
        if (!interaction.isRoleSelectMenu()) return;

        const roleId = interaction.values[0];
        const result = await this.updateMuteRole(interaction, roleId);

        const commandConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8')).actions['actions_role_mute'];
        
        if (commandConfig?.log) {
            await logSystem.logCommandUsage({
                interaction: interaction,
                commandName: 'actions_role_mute',
                moderator: interaction.user,
                target: interaction.user,
                reason: `تعيين رتبة الميوت`,
                action: 'actions_role_mute'
            });
        }

        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        await this.showMainMenu(interaction, settings.actions.mute.muteRole || '');
    },

    sendResponse(interactionOrMessage, message, isSlash) {
        if (isSlash) {
            return interactionOrMessage.reply({ content: message, ephemeral: true });
        } else {
            return interactionOrMessage.reply(message);
        }
    }
};

/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */