/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */

const { SlashCommandBuilder, PermissionFlagsBits, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logSystem  = require('../systems/log.js');
const adminGuard = require('../utils/adminGuard.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('actions_color')
        .setDescription('تغيير لون الأوامر (Hex Code)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    textCommand: {
        name: 'ac',
        aliases: []
    },

    async execute(client, interactionOrMessage, args) {
        const isSlash = interactionOrMessage.isCommand?.();
        
        try {
            const guild = interactionOrMessage.guild;
        if (!guild) return;

        const guard = await adminGuard.check('actions_color', guild.id, interactionOrMessage.channel || interactionOrMessage.channelId, interactionOrMessage.member);
        if (!guard.ok) return adminGuard.deny(interactionOrMessage, guard.reason);

        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const commandConfig = settings.actions['actions_color'];
            
            if (commandConfig.log) {
                const moderator = interactionOrMessage.user || interactionOrMessage.author;
                await logSystem.logCommandUsage({
                    interaction: interactionOrMessage,
                    commandName: commandName,
                    moderator: moderator,
                    target: moderator,
                    reason: 'فتح قائمة تغيير الوان الأوامر',
                    action: commandName
                });
            }

            const commands = Object.entries(settings.actions)
                .filter(([key]) => key !== commandName)
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    color: cmd.color || '#27ae60'
                }));

            await this.showCommandMenu(interactionOrMessage, commands, 0, isSlash);

        } catch (error) {
            console.error(`Error in actions_color:`, error);
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
            .setCustomId(`color_select_${page}`)
            .setPlaceholder('اختر الأمر لتغيير لونه')
            .setMinValues(1)
            .setMaxValues(1);

        paginatedCommands.forEach(cmd => {
            const option = new StringSelectMenuOptionBuilder()
                .setLabel(cmd.name)
                .setValue(cmd.id)
                .setDescription(`اللون الحالي: ${cmd.color}`);
            
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
                        .setCustomId(`color_prev_${page}`)
                        .setLabel('السابق')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            if (page < totalPages - 1) {
                row2.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`color_next_${page}`)
                        .setLabel('التالي')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            if (row2.components.length > 0) {
                components.push(row2);
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('التحكم في ألوان الأوامر')
            .setDescription(`اختر الأمر لتغيير لونه\nملاحظة: يجب إدخال اللون بصيغة Hex مثل #27ae60\nإجمالي الأوامر: ${commands.length}`)
            .setFooter({ text: `الصفحة ${page + 1} من ${totalPages}` });

        try {
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
        } catch (error) {
            console.error('Error in showCommandMenu:', error);
        }
    },

    async showColorModal(interaction, commandId) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const command = settings.actions[commandId];
        const currentColor = command.color || '#27ae60';

        const modal = new ModalBuilder()
            .setCustomId(`color_modal_${commandId}`)
            .setTitle(`تغيير لون ${command.label || commandId}`);

        const colorInput = new TextInputBuilder()
            .setCustomId('color_input')
            .setLabel('اللون الجديد (Hex Code)')
            .setStyle(TextInputStyle.Short)
            .setValue(currentColor)
            .setPlaceholder('#27ae60')
            .setRequired(true)
            .setMinLength(7)
            .setMaxLength(7);

        const actionRow = new ActionRowBuilder().addComponents(colorInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async updateCommandColor(commandId, newColor) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

        settings.actions[commandId].color = newColor;

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
        return settings.actions[commandId];
    },

    isValidHexColor(color) {
        return /^#[0-9A-F]{6}$/i.test(color);
    },

    async handleButton(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('color_prev_')) {
            const page = parseInt(customId.split('_')[2]);
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const commands = Object.entries(settings.actions)
                .filter(([key]) => key !== 'actions_color')
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    color: cmd.color || '#27ae60'
                }));
            await this.showCommandMenu(interaction, commands, page - 1, true);
        }
        
        else if (customId.startsWith('color_next_')) {
            const page = parseInt(customId.split('_')[2]);
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const commands = Object.entries(settings.actions)
                .filter(([key]) => key !== 'actions_color')
                .map(([key, cmd]) => ({
                    id: key,
                    name: cmd.label || key,
                    emoji: cmd.emoji || '',
                    color: cmd.color || '#27ae60'
                }));
            await this.showCommandMenu(interaction, commands, page + 1, true);
        }
    },

    async handleSelectMenu(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('color_select_')) {
            const commandId = interaction.values[0];
            await this.showColorModal(interaction, commandId);
        }
    },

    async handleModal(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('color_modal_')) {
            const commandId = customId.replace('color_modal_', '');
            const newColor = interaction.fields.getTextInputValue('color_input');
            
            if (!this.isValidHexColor(newColor)) {
                return interaction.reply({
                    content: 'اللون يجب أن يكون بصيغة Hex صحيحة مثل #27ae60',
                    ephemeral: true
                });
            }
            
            await this.updateCommandColor(commandId, newColor);
            
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const command = settings.actions[commandId];
            
            const commandConfig = settings.actions['actions_color'];
            if (commandConfig.log) {
                await logSystem.logCommandUsage({
                    interaction: interaction,
                    commandName: 'actions_color',
                    moderator: interaction.user,
                    target: interaction.user,
                    reason: `تغيير لون الأمر ${command.label || commandId} إلى ${newColor}`,
                    action: 'actions_color'
                });
            }
            
            await interaction.reply({
                content: `✅ تم تغيير لون الأمر **${command.label || commandId}** إلى ${newColor}`,
                ephemeral: true
            });
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