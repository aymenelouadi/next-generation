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
        .setName('actions_log')
        .setDescription('تفعيل او تعطيل تسجيل الاوامر')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    textCommand: {
        name: 'alog',
        aliases: []
    },

    async execute(client, interactionOrMessage, args) {
        const isSlash = interactionOrMessage.isCommand?.();
        
        try {
            const guild = interactionOrMessage.guild;
        if (!guild) return;

        const guard = await adminGuard.check('actions_log', guild.id, interactionOrMessage.channel || interactionOrMessage.channelId, interactionOrMessage.member);
        if (!guard.ok) return adminGuard.deny(interactionOrMessage, guard.reason);

        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const commandConfig = settings.actions['actions_log'];

            const commands = Object.entries(settings.actions)
                .filter(([key, cmd]) => key !== commandName && cmd.hasOwnProperty('log'))
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    log: cmd.log || false,
                    color: cmd.color || '#5865F2'
                }));

            if (commandConfig.log) {
                const moderator = interactionOrMessage.user || interactionOrMessage.author;
                await logSystem.logCommandUsage({
                    interaction: interactionOrMessage,
                    commandName: commandName,
                    moderator: moderator,
                    target: moderator,
                    reason: 'فتح قائمة تسجيل الاوامر',
                    action: commandName
                });
            }

            await this.showCommandMenu(interactionOrMessage, commands, 0, isSlash);

        } catch (error) {
            console.error(`Error in actions_log:`, error);
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
            .setCustomId(`log_select_${page}`)
            .setPlaceholder('اختر الأمر لتغيير حالة التسجيل')
            .setMinValues(1)
            .setMaxValues(1);

        paginatedCommands.forEach(cmd => {
            const option = new StringSelectMenuOptionBuilder()
                .setLabel(`${cmd.name} ${cmd.log ? '📝' : '🚫'}`)
                .setValue(cmd.id)
                .setDescription(`التسجيل: ${cmd.log ? 'مفعل' : 'معطل'}`);
            
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
                        .setCustomId(`log_prev_${page}`)
                        .setLabel('السابق')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId(`log_page_${page}`)
                    .setLabel(`${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true)
            );
            
            if (page < totalPages - 1) {
                row2.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`log_next_${page}`)
                        .setLabel('التالي')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            components.push(row2);
        }

        const enabledCount = commands.filter(c => c.log).length;
        const disabledCount = commands.filter(c => !c.log).length;

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('التحكم في تسجيل الاوامر')
            .setDescription(`اختر الأمر لتغيير حالة التسجيل\n\nمفعل: ${enabledCount}\nمعطل: ${disabledCount}\nاجمالي الاوامر: ${commands.length}`)
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
            return interaction.update({ content: 'الأمر غير موجود', embeds: [], components: [] });
        }
        const currentStatus = command.log || false;

        let description = `حالة التسجيل الحالية: ${currentStatus ? '📝 مفعل' : '🚫 معطل'}\n\nاختر الإجراء المناسب:`;
        if (statusMessage) description = `${statusMessage}\n\n${description}`;

        const embed = new EmbedBuilder()
            .setColor(command.color || '#5865F2')
            .setTitle(command.label || commandId)
            .setDescription(description);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`log_enable_${commandId}`)
                    .setLabel('تفعيل التسجيل')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(currentStatus === true),
                new ButtonBuilder()
                    .setCustomId(`log_disable_${commandId}`)
                    .setLabel('تعطيل التسجيل')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(currentStatus === false),
                new ButtonBuilder()
                    .setCustomId(`log_back`)
                    .setLabel('رجوع')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.update({ embeds: [embed], components: [row] });
    },

    async updateCommandLog(commandId, newStatus) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

        settings.actions[commandId].log = newStatus;

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
        return settings.actions[commandId];
    },

    async handleButton(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('log_prev_')) {
            const page = parseInt(customId.split('_')[2]);
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const commands = Object.entries(settings.actions)
                .filter(([key, cmd]) => key !== 'actions_log' && cmd.hasOwnProperty('log'))
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    log: cmd.log || false
                }));
            await this.showCommandMenu(interaction, commands, page - 1, true);
        }
        
        else if (customId.startsWith('log_next_')) {
            const page = parseInt(customId.split('_')[2]);
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const commands = Object.entries(settings.actions)
                .filter(([key, cmd]) => key !== 'actions_log' && cmd.hasOwnProperty('log'))
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    log: cmd.log || false
                }));
            await this.showCommandMenu(interaction, commands, page + 1, true);
        }
        
        else if (customId === 'log_back') {
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const commands = Object.entries(settings.actions)
                .filter(([key, cmd]) => key !== 'actions_log' && cmd.hasOwnProperty('log'))
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    log: cmd.log || false
                }));
            await this.showCommandMenu(interaction, commands, 0, true);
        }
        
        else if (customId.startsWith('log_enable_')) {
            const commandId = customId.replace('log_enable_', '');
            await this.updateCommandLog(commandId, true);
            
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const command = settings.actions[commandId];
            const commandConfig = settings.actions['actions_log'];
            
            if (commandConfig && commandConfig.log) {
                await logSystem.logCommandUsage({
                    interaction: interaction,
                    commandName: 'actions_log',
                    moderator: interaction.user,
                    target: interaction.user,
                    reason: `تفعيل التسجيل للأمر ${command.label || commandId}`,
                    action: 'actions_log'
                });
            }
            
            await this.showCommandActions(interaction, commandId, `✅ تم تفعيل التسجيل للأمر **${command.label || commandId}**`);
        }
        
        else if (customId.startsWith('log_disable_')) {
            const commandId = customId.replace('log_disable_', '');
            await this.updateCommandLog(commandId, false);
            
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const command = settings.actions[commandId];
            const commandConfig = settings.actions['actions_log'];
            
            if (commandConfig && commandConfig.log) {
                await logSystem.logCommandUsage({
                    interaction: interaction,
                    commandName: 'actions_log',
                    moderator: interaction.user,
                    target: interaction.user,
                    reason: `تعطيل التسجيل للأمر ${command.label || commandId}`,
                    action: 'actions_log'
                });
            }
            
            await this.showCommandActions(interaction, commandId, `❌ تم تعطيل التسجيل للأمر **${command.label || commandId}**`);
        }
    },

    async handleSelectMenu(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('log_select_')) {
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