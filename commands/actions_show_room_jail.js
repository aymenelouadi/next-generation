/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */

const { SlashCommandBuilder, PermissionFlagsBits, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logSystem  = require('../systems/log.js');
const adminGuard = require('../utils/adminGuard.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('actions_show_room_jail')
        .setDescription('ادارة غرف السجن المسموح مشاهدتها')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    textCommand: {
        name: 'asrj',
        aliases: []
    },

    async execute(client, interactionOrMessage, args) {
        const isSlash = interactionOrMessage.isCommand?.();
        
        try {
            const guild = interactionOrMessage.guild;
        if (!guild) return;

        const guard = await adminGuard.check('actions_show_room_jail', guild.id, interactionOrMessage.channel || interactionOrMessage.channelId, interactionOrMessage.member);
        if (!guard.ok) return adminGuard.deny(interactionOrMessage, guard.reason);

        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const commandConfig = settings.actions['actions_show_room_jail'];

            const jailCommand = settings.actions.jail;
            if (!jailCommand) {
                return this.sendResponse(interactionOrMessage, 'أمر jail غير موجود في الإعدادات', isSlash);
            }

            if (commandConfig.log) {
                const moderator = interactionOrMessage.user || interactionOrMessage.author;
                await logSystem.logCommandUsage({
                    interaction: interactionOrMessage,
                    commandName: commandName,
                    moderator: moderator,
                    target: moderator,
                    reason: 'فتح قائمة ادارة غرف السجن',
                    action: commandName
                });
            }

            const showRooms = jailCommand.showRoom || [];
            
            await this.showMainMenu(interactionOrMessage, showRooms, isSlash);

        } catch (error) {
            console.error(`Error in actions_show_room_jail:`, error);
            return this.sendResponse(interactionOrMessage, 'حدث خطأ', isSlash);
        }
    },


    async showMainMenu(context, showRooms, isSlash) {
        const embed = new EmbedBuilder()
            .setColor('#27ae60')
            .setTitle('ادارة غرف السجن المسموح مشاهدتها')
            .setDescription('يمكن للمسجونين رؤية الغرف المحددة فقط\n\nالغرف الحالية:')
            .setFooter({ text: 'اختر الإجراء المناسب' });

        if (showRooms.length > 0) {
            const roomsList = showRooms.map((roomId, index) => {
                const room = context.guild?.channels.cache.get(roomId);
                return `${index + 1}. ${room ? room.name : 'غير معروف'} (${roomId})`;
            }).join('\n');
            embed.addFields({ name: 'قائمة الغرف', value: roomsList });
        } else {
            embed.addFields({ name: 'قائمة الغرف', value: 'لا توجد غرف محددة' });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('jail_rooms_add')
                    .setLabel('اضافة غرف')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('jail_rooms_remove')
                    .setLabel('ازالة غرف')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(showRooms.length === 0),
                new ButtonBuilder()
                    .setCustomId('jail_rooms_clear')
                    .setLabel('مسح الكل')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(showRooms.length === 0)
            );

        if (context.isButton?.() || context.isChannelSelectMenu?.()) {
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

    async showChannelSelector(interaction, action) {
        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId(`jail_rooms_${action}_select`)
            .setPlaceholder(action === 'add' ? 'اختر الغرف المراد اضافتها' : 'اختر الغرف المراد ازالتها')
            .setMinValues(1)
            .setMaxValues(25)
            .setChannelTypes([ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildAnnouncement]);

        const row = new ActionRowBuilder().addComponents(channelSelect);

        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('jail_rooms_back')
                    .setLabel('رجوع')
                    .setStyle(ButtonStyle.Secondary)
            );

        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const currentRooms = settings.actions.jail.showRoom || [];

        let embedDescription = '';
        if (action === 'add') {
            embedDescription = 'اختر الغرف التي تريد اضافتها للقائمة المسموح مشاهدتها للمسجونين';
        } else {
            embedDescription = 'اختر الغرف التي تريد ازالتها من القائمة';
            
            if (currentRooms.length > 0) {
                const roomsList = currentRooms.map(roomId => {
                    const room = interaction.guild?.channels.cache.get(roomId);
                    return `• ${room ? room.name : 'غير معروف'} (${roomId})`;
                }).join('\n');
                embedDescription += `\n\nالغرف الحالية:\n${roomsList}`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#27ae60')
            .setTitle(action === 'add' ? 'اضافة غرف' : 'ازالة غرف')
            .setDescription(embedDescription);

        await interaction.update({ embeds: [embed], components: [row, backButton] });
    },

    async updateShowRooms(interaction, selectedChannels, action) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

        if (!settings.actions.jail.showRoom) {
            settings.actions.jail.showRoom = [];
        }

        if (action === 'add') {
            const newRooms = selectedChannels.filter(id => !settings.actions.jail.showRoom.includes(id));
            settings.actions.jail.showRoom.push(...newRooms);
            
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
            
            const addedRooms = newRooms.map(id => {
                const room = interaction.guild?.channels.cache.get(id);
                return room ? room.name : id;
            }).join(', ');
            
            return {
                success: true,
                message: `تم اضافة الغرف بنجاح: ${addedRooms}`,
                count: newRooms.length
            };
        } else {
            const removedRooms = selectedChannels.filter(id => settings.actions.jail.showRoom.includes(id));
            settings.actions.jail.showRoom = settings.actions.jail.showRoom.filter(id => !selectedChannels.includes(id));
            
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
            
            const removedRoomsNames = removedRooms.map(id => {
                const room = interaction.guild?.channels.cache.get(id);
                return room ? room.name : id;
            }).join(', ');
            
            return {
                success: true,
                message: `تم ازالة الغرف بنجاح: ${removedRoomsNames}`,
                count: removedRooms.length
            };
        }
    },

    async clearAllRooms(interaction) {
        const settingsPath = path.join(__dirname, '../settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

        const oldCount = settings.actions.jail.showRoom?.length || 0;
        settings.actions.jail.showRoom = [];

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));

        return {
            success: true,
            message: `تم مسح جميع الغرف (${oldCount} غرفة)`,
            count: oldCount
        };
    },

    async handleButton(interaction) {
        const customId = interaction.customId;
        const commandConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8')).actions['actions_show_room_jail'];

        if (customId === 'jail_rooms_add') {
            await this.showChannelSelector(interaction, 'add');
        }
        else if (customId === 'jail_rooms_remove') {
            await this.showChannelSelector(interaction, 'remove');
        }
        else if (customId === 'jail_rooms_clear') {
            const result = await this.clearAllRooms(interaction);
            
            if (commandConfig?.log) {
                await logSystem.logCommandUsage({
                    interaction: interaction,
                    commandName: 'actions_show_room_jail',
                    moderator: interaction.user,
                    target: interaction.user,
                    reason: `مسح جميع غرف السجن`,
                    action: 'actions_show_room_jail'
                });
            }
            
            await this.showMainMenu(interaction, []);
        }
        else if (customId === 'jail_rooms_back') {
            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            await this.showMainMenu(interaction, settings.actions.jail.showRoom || []);
        }
    },

    async handleChannelSelect(interaction) {
        if (!interaction.isChannelSelectMenu()) return;

        const customId = interaction.customId;
        
        if (customId.startsWith('jail_rooms_')) {
            const action = customId.split('_')[2];
            const selectedChannels = interaction.values;

            const result = await this.updateShowRooms(interaction, selectedChannels, action);

            const commandConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8')).actions['actions_show_room_jail'];
            
            if (commandConfig?.log) {
                await logSystem.logCommandUsage({
                    interaction: interaction,
                    commandName: 'actions_show_room_jail',
                    moderator: interaction.user,
                    target: interaction.user,
                    reason: `${action === 'add' ? 'اضافة' : 'ازالة'} غرف للسجن`,
                    action: 'actions_show_room_jail'
                });
            }

            const settingsPath = path.join(__dirname, '../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            await this.showMainMenu(interaction, settings.actions.jail.showRoom || []);
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