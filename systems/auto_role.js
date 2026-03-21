/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */

const { PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
const guildDb = require('../dashboard/utils/guildDb');

module.exports = {
    name: 'auto-role-system',

    execute(client) {
        logger.info('Loading auto-role system...');

        this.client = client;
        this.invitesCache = new Map(); // guildId => Map(code => uses)

        client.once('ready', async () => {
            for (const guild of client.guilds.cache.values()) {
                await this.cacheGuildInvites(guild);
            }
        });

        client.on('guildCreate', async (guild) => {
            await this.cacheGuildInvites(guild);
        });

        client.on('inviteCreate', (invite) => {
            const guildId = invite.guild?.id;
            if (!guildId || !invite.code) return;
            const cached = this.invitesCache.get(guildId) || new Map();
            cached.set(invite.code, invite.uses || 0);
            this.invitesCache.set(guildId, cached);
        });

        client.on('inviteDelete', (invite) => {
            const guildId = invite.guild?.id;
            if (!guildId || !invite.code) return;
            const cached = this.invitesCache.get(guildId);
            if (!cached) return;
            cached.delete(invite.code);
            this.invitesCache.set(guildId, cached);
        });

        client.on('interactionCreate', async (interaction) => {
            if (interaction.isButton() && interaction.customId.startsWith('autorole_')) {
                logger.info(`Button pressed: ${interaction.customId}`);
                await this.handleButtonInteraction(interaction);
            }

            if (interaction.isStringSelectMenu() && interaction.customId.startsWith('autorole_select_')) {
                logger.info(`Select menu used: ${interaction.customId}`);
                await this.handleSelectMenu(interaction);
            }
        });

        client.on('guildMemberAdd', async (member) => {
            logger.info(`New member joined: ${member.user.tag} (${member.user.bot ? 'bot' : 'human'})`);
            await this.assignAutoRoles(member);
        });

        logger.info('Auto-role system loaded successfully');
    },

    loadDatabase() {}, // no-op — data is now per-guild via guildDb

    saveDatabase() {},  // no-op — use guildDb.write() directly

    normalizeGuildData(guildId, data) {
        const obj = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
        const memberRoles = Array.isArray(obj.memberRoles)
            ? obj.memberRoles
            : (Array.isArray(obj.humans) ? obj.humans : []);
        const botRoles = Array.isArray(obj.botRoles)
            ? obj.botRoles
            : (Array.isArray(obj.bots) ? obj.bots : []);
        const inviteRoles = Array.isArray(obj.inviteRoles)
            ? obj.inviteRoles
            : [];

        return {
            guildId: String(guildId),
            enabled: obj.enabled !== false,
            memberRoles: Array.from(new Set(memberRoles.map(String).filter(Boolean))),
            botRoles: Array.from(new Set(botRoles.map(String).filter(Boolean))),
            inviteRoles: inviteRoles
                .filter(x => x && typeof x === 'object')
                .map(x => ({ invite: String(x.invite || '').trim(), role: String(x.role || '').trim() }))
                .filter(x => x.invite && x.role)
        };
    },

    getGuildData(guildId) {
        const raw = guildDb.read(guildId, 'auto_role', {});
        return this.normalizeGuildData(guildId, raw);
    },

    async cacheGuildInvites(guild) {
        try {
            if (!guild || !guild.members?.me) return;
            if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild)) return;

            const invites = await guild.invites.fetch();
            const map = new Map();
            invites.forEach(inv => map.set(inv.code, inv.uses || 0));
            this.invitesCache.set(guild.id, map);
        } catch (error) {
            logger.info(`[auto-role] Could not cache invites for guild ${guild?.id}: ${error.message}`);
        }
    },

    async resolveUsedInvite(guild) {
        try {
            if (!guild || !guild.members?.me) return null;
            if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild)) return null;

            const previous = this.invitesCache.get(guild.id) || new Map();
            const currentInvites = await guild.invites.fetch();
            const current = new Map();
            currentInvites.forEach(inv => current.set(inv.code, inv.uses || 0));

            let usedCode = null;
            let deltaMax = 0;

            for (const [code, uses] of current.entries()) {
                const oldUses = previous.get(code) || 0;
                const delta = uses - oldUses;
                if (delta > deltaMax) {
                    deltaMax = delta;
                    usedCode = code;
                }
            }

            this.invitesCache.set(guild.id, current);
            return usedCode;
        } catch (error) {
            logger.info(`[auto-role] Could not resolve used invite in guild ${guild?.id}: ${error.message}`);
            return null;
        }
    },

    async handleButtonInteraction(interaction) {
        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return await interaction.reply({
                    content: 'You need `Manage Roles` permission',
                    ephemeral: true
                });
            }

            const customId = interaction.customId;
            logger.info(`Processing button: ${customId}`);

            if (customId === 'autorole_humans') {
                await this.showRoleActions(interaction, 'humans');
            }
            else if (customId === 'autorole_bots') {
                await this.showRoleActions(interaction, 'bots');
            }
            else if (customId === 'autorole_back') {
                await this.showMainMenu(interaction);
            }
            else if (customId.startsWith('autorole_') && customId.includes('_add')) {
                const type = customId.split('_')[1];
                await this.showRoleSelection(interaction, type, 'add');
            }
            else if (customId.startsWith('autorole_') && customId.includes('_remove')) {
                const type = customId.split('_')[1];
                await this.showRoleSelection(interaction, type, 'remove');
            }
        } catch (error) {
            logger.error('Error in handleButtonInteraction:', error);
            await interaction.reply({ content: 'An error occurred', ephemeral: true });
        }
    },

    async handleSelectMenu(interaction) {
        try {
            const customId = interaction.customId;
            const [,, type, action] = customId.split('_');
            const roleId = interaction.values[0];
            const guildId = interaction.guildId;

            logger.info(`Processing select menu: type=${type}, action=${action}, roleId=${roleId}`);

            const guild = interaction.guild;
            const role = guild.roles.cache.get(roleId);

            if (!role) {
                return await interaction.update({
                    content: 'Role not found',
                    embeds: [], components: [] 
                });
            }

            this.loadDatabase();

            const guildData = this.getGuildData(guildId);
            const typeKey = type === 'bots' ? 'botRoles' : 'memberRoles';

            let statusMessage;

            if (action === 'add') {
                if (!guildData[typeKey].includes(roleId)) {
                    guildData[typeKey].push(roleId);
                    guildData[typeKey] = Array.from(new Set(guildData[typeKey]));
                    guildDb.write(guildId, 'auto_role', guildData);
                    logger.info(`Added: ${role.name} to ${type}`);
                    statusMessage = `✅ Role **${role.name}** added for ${type}`;
                } else {
                    logger.info(`Role already exists: ${role.name} in ${type}`);
                    statusMessage = `⚠️ Role **${role.name}** already exists for ${type}`;
                }
            } else if (action === 'remove') {
                const index = guildData[typeKey].indexOf(roleId);
                if (index !== -1) {
                    guildData[typeKey].splice(index, 1);
                    guildDb.write(guildId, 'auto_role', guildData);
                    logger.info(`Removed: ${role.name} from ${type}`);
                    statusMessage = `❌ Role **${role.name}** removed from ${type}`;
                } else {
                    logger.info(`Role not found: ${role.name} in ${type}`);
                    statusMessage = `⚠️ Role **${role.name}** not found for ${type}`;
                }
            }

            await this.showRoleActions(interaction, type, statusMessage);

        } catch (error) {
            logger.error('Error in handleSelectMenu:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred', ephemeral: true });
            }
        }
    },

    async showMainMenu(interaction) {
        try {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('autorole_humans')
                        .setLabel('👤 Members')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('autorole_bots')
                        .setLabel('🤖 Bots')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.update({
                content: '## ⚙️ Auto Role Management\n> Select the user type to manage auto roles for',
                embeds: [],
                components: [row]
            });
        } catch (error) {
            logger.error('Error in showMainMenu:', error);
        }
    },

    async showRoleActions(interaction, type, statusMessage = null) {
        try {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const typeLabel = type === 'humans' ? '👤 Members' : '🤖 Bots';
            const header = statusMessage
                ? `${statusMessage}\n\n## ${typeLabel}\n> Select an action`
                : `## ${typeLabel}\n> Select an action`;

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`autorole_${type}_add`)
                        .setLabel('➕ Add Role')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`autorole_${type}_remove`)
                        .setLabel('➖ Remove Role')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('autorole_back')
                        .setLabel('← Back')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({ content: header, embeds: [], components: [row] });
        } catch (error) {
            logger.error('Error in showRoleActions:', error);
        }
    },

    async showRoleSelection(interaction, type, action) {
        try {
            const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const guild = interaction.guild;
            const roles = guild.roles.cache
                .filter(role => role.id !== guild.id)
                .sort((a, b) => b.position - a.position)
                .first(25);

            if (roles.length === 0) {
                return await interaction.update({
                    content: '⚠️ No roles found in this server',
                    embeds: [],
                    components: []
                });
            }

            const actionLabel = action === 'add' ? '➕ Add' : '➖ Remove';
            const typeLabel = type === 'humans' ? '👤 Members' : '🤖 Bots';
            const placeholder = action === 'add' ? 'Select a role to add' : 'Select a role to remove';

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`autorole_select_${type}_${action}`)
                .setPlaceholder(placeholder)
                .setMinValues(1)
                .setMaxValues(1);

            roles.forEach(role => {
                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(role.name)
                        .setValue(role.id)
                        .setDescription(`ID: ${role.id}`)
                );
            });

            const row1 = new ActionRowBuilder().addComponents(selectMenu);
            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`autorole_${type}`)
                        .setLabel('← Back')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({
                content: `## ${actionLabel} Role — ${typeLabel}\n> Select a role from the list`,
                embeds: [],
                components: [row1, row2]
            });
        } catch (error) {
            logger.error('Error in showRoleSelection:', error);
        }
    },

    async addRolesSafely(member, roleIds) {
        if (!Array.isArray(roleIds) || roleIds.length === 0) return 0;

        const guild = member.guild;
        const botMember = await guild.members.fetch(this.client.user.id).catch(() => null);
        if (!botMember) {
            logger.info('Bot not found in server');
            return 0;
        }

        const botHighestRole = botMember.roles.highest;
        let rolesAdded = 0;

        for (const roleId of roleIds) {
            try {
                const role = guild.roles.cache.get(roleId);
                if (!role) continue;
                if (role.position >= botHighestRole.position) continue;
                if (member.roles.cache.has(role.id)) continue;

                await member.roles.add(role);
                rolesAdded++;
            } catch (error) {
                logger.error(`Error adding role ${roleId}:`, error.message);
            }
        }

        return rolesAdded;
    },

    async assignAutoRoles(member) {
        try {
            logger.info(`Attempting to assign auto roles to ${member.user.tag}`);

            const guild   = member.guild;
            const guildId = guild.id;

            const guildData = this.getGuildData(guildId);
            if (!guildData.enabled) {
                logger.info(`Auto-role disabled in guild ${guildId}`);
                return;
            }

            const isBot = member.user.bot;
            const baseRoles = isBot ? guildData.botRoles : guildData.memberRoles;
            const roleSet = new Set(baseRoles);

            if (!isBot && guildData.inviteRoles.length > 0) {
                const usedInvite = await this.resolveUsedInvite(guild);
                if (usedInvite) {
                    const inviteRule = guildData.inviteRoles.find(x => x.invite === usedInvite);
                    if (inviteRule?.role) {
                        roleSet.add(inviteRule.role);
                        logger.info(`[auto-role] Invite ${usedInvite} matched role ${inviteRule.role}`);
                    }
                }
            }

            const roleIds = Array.from(roleSet);
            if (roleIds.length === 0) {
                logger.info(`No roles configured for member type in guild ${guildId}`);
                return;
            }

            const rolesAdded = await this.addRolesSafely(member, roleIds);

            if (rolesAdded > 0) {
                logger.info(`Added ${rolesAdded} auto roles to ${member.user.tag}`);
            } else {
                logger.info(`No roles added to ${member.user.tag}`);
            }

        } catch (error) {
            logger.error('Error in assignAutoRoles:', error);
            logger.error('Stack:', error.stack);
        }
    }
};

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */