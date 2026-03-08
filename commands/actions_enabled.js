/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */

const { SlashCommandBuilder, PermissionFlagsBits, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logSystem  = require('../systems/log.js');
const adminGuard = require('../utils/adminGuard.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('actions_enabled')
        .setDescription('تفعيل او تعطيل الاوامر')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    textCommand: {
        name: 'ae',
        aliases: []
    },

    async execute(client, interactionOrMessage, args) {
        const isSlash = interactionOrMessage.isCommand?.();
        
        try {
            const guild = interactionOrMessage.guild;
        if (!guild) return;

        const guard = await adminGuard.check('actions_enabled', guild.id, interactionOrMessage.channel || interactionOrMessage.channelId, interactionOrMessage.member);
        if (!guard.ok) return adminGuard.deny(interactionOrMessage, guard.reason);

        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const commandConfig = settings.actions['actions_enabled'];

            const commands = Object.entries(settings.actions)
                .filter(([key]) => key !== commandName)
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    enabled: cmd.enabled || false,
                    color: cmd.color || '#5865F2'
                }));

            if (commandConfig.log) {
                const moderator = interactionOrMessage.user || interactionOrMessage.author;
                await logSystem.logCommandUsage({
                    interaction: interactionOrMessage,
                    commandName: commandName,
                    moderator: moderator,
                    target: moderator,
                    reason: 'فتح قائمة تفعيل الاوامر',
                    action: commandName
                });
            }

            await this.showCommandMenu(interactionOrMessage, commands, 0, isSlash);

        } catch (error) {
            console.error(`Error in actions_enabled:`, error);
            return this.sendResponse(interactionOrMessage, 'حدث خطأ', isSlash);
        }
    },


    async showCommandMenu(context, commands, page = 0, isSlash) {
        const perPage = 25;
        const start = page * perPage;
        const end = start + perPage;
        const paginatedCommands = commands.slice(start, end);
        const totalPages = Math.ceil(commands.length / perPage);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`enabled_select_${page}`)
            .setPlaceholder('اختر الأمر لتغيير حالة التفعيل')
            .setMinValues(1)
            .setMaxValues(1);

        paginatedCommands.forEach(cmd => {
            const option = new StringSelectMenuOptionBuilder()
                .setLabel(`${cmd.name} ${cmd.enabled ? '✅' : '❌'}`)
                .setValue(cmd.id)
                .setDescription(`الحالة: ${cmd.enabled ? 'مفعل' : 'معطل'}`);
            
            if (cmd.emoji) {
                option.setEmoji(cmd.emoji);
            }
            
            selectMenu.addOptions(option);
        });

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const components = [row1];

        if (commands.length > perPage) {
            const row2 = new ActionRowBuilder();
            
            if (page > 0) {
                row2.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`enabled_prev_${page}`)
                        .setLabel('السابق')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId(`enabled_page_${page}`)
                    .setLabel(`${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true)
            );
            
            if (page < totalPages - 1) {
                row2.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`enabled_next_${page}`)
                        .setLabel('التالي')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            components.push(row2);
        }

        const enabledCount = commands.filter(c => c.enabled).length;
        const disabledCount = commands.filter(c => !c.enabled).length;

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('التحكم في تفعيل الاوامر')
            .setDescription(`اختر الأمر لتغيير حالة التفعيل\n\nمفعل: ${enabledCount}\nمعطل: ${disabledCount}\nاجمالي الاوامر: ${commands.length}`)
            .setFooter({ text: `الصفحة ${page + 1} من ${totalPages}` });

        if (context.isButton?.() || context.isStringSelectMenu?.()) {
            await context.update({ embeds: [embed], components });
        } else if (isSlash) {
            if (context.replied || context.deferred) {
                await context.editReply({ embeds: [embed], components });
            } else {
                await context.reply({ embeds: [embed], components, ephemeral: true });
            }
        } else {
            await context.reply({ embeds: [embed], components });
        }
    },

    async showCommandActions(interaction, commandId, statusMessage = null) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        const command = settings.actions[commandId];
        if (!command) {
            return interaction.update({ content: 'الأمر غير موجود في الإعدادات', embeds: [], components: [] });
        }
        const currentStatus = command.enabled || false;

        let description = `الحالة الحالية: ${currentStatus ? '✅ مفعل' : '❌ معطل'}\n\nاختر الإجراء المناسب:`;
        if (statusMessage) description = `${statusMessage}\n\n${description}`;

        const embed = new EmbedBuilder()
            .setColor(command.color || '#5865F2')
            .setTitle(command.label || commandId)
            .setDescription(description);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`enabled_enable_${commandId}`)
                    .setLabel('تفعيل')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(currentStatus === true),
                new ButtonBuilder()
                    .setCustomId(`enabled_disable_${commandId}`)
                    .setLabel('تعطيل')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(currentStatus === false),
                new ButtonBuilder()
                    .setCustomId(`enabled_back`)
                    .setLabel('رجوع')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.update({ embeds: [embed], components: [row] });
    },

    async updateCommandStatus(commandId, newStatus) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

        settings.actions[commandId].enabled = newStatus;

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
        return settings.actions[commandId];
    },

    async handleButton(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('enabled_prev_')) {
            const page = parseInt(customId.split('_')[2]);
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const commands = Object.entries(settings.actions)
                .filter(([key]) => key !== 'actions_enabled')
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    enabled: cmd.enabled || false
                }));
            await this.showCommandMenu(interaction, commands, page - 1, true);
        }
        
        else if (customId.startsWith('enabled_next_')) {
            const page = parseInt(customId.split('_')[2]);
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const commands = Object.entries(settings.actions)
                .filter(([key]) => key !== 'actions_enabled')
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    enabled: cmd.enabled || false
                }));
            await this.showCommandMenu(interaction, commands, page + 1, true);
        }
        
        else if (customId === 'enabled_back') {
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const commands = Object.entries(settings.actions)
                .filter(([key]) => key !== 'actions_enabled')
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    enabled: cmd.enabled || false
                }));
            await this.showCommandMenu(interaction, commands, 0, true);
        }
        
        else if (customId.startsWith('enabled_enable_')) {
            const commandId = customId.replace('enabled_enable_', '');
            await this.updateCommandStatus(commandId, true);
            
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const command = settings.actions[commandId];
            const commandConfig = settings.actions['actions_enabled'];
            
            if (commandConfig && commandConfig.log) {
                await logSystem.logCommandUsage({
                    interaction: interaction,
                    commandName: 'actions_enabled',
                    moderator: interaction.user,
                    target: interaction.user,
                    reason: `تفعيل الأمر ${command.label || commandId}`,
                    action: 'actions_enabled'
                });
            }
            
            await this.showCommandActions(interaction, commandId, `✅ تم تفعيل الأمر **${command.label || commandId}** بنجاح`);
        }
        
        else if (customId.startsWith('enabled_disable_')) {
            const commandId = customId.replace('enabled_disable_', '');
            await this.updateCommandStatus(commandId, false);
            
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const command = settings.actions[commandId];
            const commandConfig = settings.actions['actions_enabled'];
            
            if (commandConfig && commandConfig.log) {
                await logSystem.logCommandUsage({
                    interaction: interaction,
                    commandName: 'actions_enabled',
                    moderator: interaction.user,
                    target: interaction.user,
                    reason: `تعطيل الأمر ${command.label || commandId}`,
                    action: 'actions_enabled'
                });
            }
            
            await this.showCommandActions(interaction, commandId, `❌ تم تعطيل الأمر **${command.label || commandId}** بنجاح`);
        }
    },

    async handleSelectMenu(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('enabled_select_')) {
            const commandId = interaction.values[0];
            await this.showCommandActions(interaction, commandId);
        }
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