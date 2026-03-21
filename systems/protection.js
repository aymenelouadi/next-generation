/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */

const { AuditLogEvent } = require('discord.js');
const logger       = require('../utils/logger');
const settingsUtil = require('../utils/settings');
const guildDb      = require('../dashboard/utils/guildDb');

// Track action counts per user per event type within a time window
const actionTrackers = new Map();
const WINDOW_MS = 10 * 1000; // 10-second window

module.exports = {
    name: 'protection-system',

    execute(client) {
        this.client = client;

        // ─── Anti Ban ───────────────────────────────────────────────────────
        client.on('guildBanAdd', async (ban) => {
            try {
                await new Promise(r => setTimeout(r, 800));
                const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 }).catch(() => null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (!entry || Date.now() - entry.createdTimestamp > 4000) return;
                if (entry.executor?.id === this.client.user?.id) return;

                await this.handleEvent(ban.guild, entry.executor, 'anti_ban', async () => {
                    await ban.guild.bans.remove(ban.user.id, 'Anti-ban: auto-unban').catch(() => {});
                });
            } catch (e) {
                logger.error('Protection guildBanAdd error', { category: 'protection', error: e.message, stack: e.stack });
            }
        });

        // ─── Anti Kick ──────────────────────────────────────────────────────
        client.on('guildMemberRemove', async (member) => {
            if (member.user.bot) return;
            try {
                await new Promise(r => setTimeout(r, 800));
                const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 }).catch(() => null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (!entry || entry.target?.id !== member.id) return;
                if (Date.now() - entry.createdTimestamp > 4000) return;
                if (entry.executor?.id === this.client.user?.id) return;

                await this.handleEvent(member.guild, entry.executor, 'anti_kick', null);
            } catch (e) {
                logger.error('Protection guildMemberRemove error', { category: 'protection', error: e.message, stack: e.stack });
            }
        });

        // ─── Anti Channel Create ─────────────────────────────────────────────
        client.on('channelCreate', async (channel) => {
            if (!channel.guild) return;
            try {
                await new Promise(r => setTimeout(r, 800));
                const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 }).catch(() => null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (!entry || Date.now() - entry.createdTimestamp > 4000) return;
                if (entry.executor?.id === this.client.user?.id) return;

                await this.handleEvent(channel.guild, entry.executor, 'anti_channel_create', async () => {
                    await channel.delete('Anti-channel-create: auto-delete').catch(() => {});
                });
            } catch (e) {
                logger.error('Protection channelCreate error', { category: 'protection', error: e.message, stack: e.stack });
            }
        });

        // ─── Anti Channel Delete ──────────────────────────────────────────────
        client.on('channelDelete', async (channel) => {
            if (!channel.guild) return;
            try {
                await new Promise(r => setTimeout(r, 800));
                const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 }).catch(() => null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (!entry || Date.now() - entry.createdTimestamp > 4000) return;
                if (entry.executor?.id === this.client.user?.id) return;

                await this.handleEvent(channel.guild, entry.executor, 'anti_channel_delete', null);
            } catch (e) {
                logger.error('Protection channelDelete error', { category: 'protection', error: e.message, stack: e.stack });
            }
        });

        // ─── Anti Role Create ──────────────────────────────────────────────────
        client.on('roleCreate', async (role) => {
            try {
                await new Promise(r => setTimeout(r, 800));
                const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 }).catch(() => null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (!entry || Date.now() - entry.createdTimestamp > 4000) return;
                if (entry.executor?.id === this.client.user?.id) return;

                await this.handleEvent(role.guild, entry.executor, 'anti_role_create', async () => {
                    await role.delete('Anti-role-create: auto-delete').catch(() => {});
                });
            } catch (e) {
                logger.error('Protection roleCreate error', { category: 'protection', error: e.message, stack: e.stack });
            }
        });

        // ─── Anti Role Delete ──────────────────────────────────────────────────
        client.on('roleDelete', async (role) => {
            try {
                await new Promise(r => setTimeout(r, 800));
                const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 }).catch(() => null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (!entry || Date.now() - entry.createdTimestamp > 4000) return;
                if (entry.executor?.id === this.client.user?.id) return;

                await this.handleEvent(role.guild, entry.executor, 'anti_role_delete', null);
            } catch (e) {
                logger.error('Protection roleDelete error', { category: 'protection', error: e.message, stack: e.stack });
            }
        });

        // ─── Anti Bots ────────────────────────────────────────────────────────
        client.on('guildMemberAdd', async (member) => {
            if (!member.user.bot) return;
            try {
                await new Promise(r => setTimeout(r, 800));
                const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 }).catch(() => null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (!entry || Date.now() - entry.createdTimestamp > 5000) return;
                if (entry.executor?.id === this.client.user?.id) return;

                const protection = this.getGuildProtection(member.guild.id);
                if (!protection.anti_bots?.enabled) return;

                const executor = await member.guild.members.fetch(entry.executor.id).catch(() => null);
                if (!executor) return;
                if (this.isWhitelisted(executor, protection)) return;

                // Kick the unauthorized bot
                await member.kick('Anti-bot: unauthorized bot').catch(() => {});

                // Punish who added it
                await this.applyAction(member.guild, executor, protection.anti_bots.action, 'Anti-bot: added unauthorized bot');
                logger.protection('Anti-bot: unauthorized bot addition', {
                    executor: executor.user.tag, executorId: executor.id,
                    bot: member.user.tag, botId: member.id, guildId: member.guild.id,
                });
            } catch (e) {
                logger.error('Protection guildMemberAdd (bots) error', { category: 'protection', error: e.message, stack: e.stack });
            }
        });

        // ─── Anti Webhooks ─────────────────────────────────────────────────────
        client.on('webhooksUpdate', async (channel) => {
            try {
                await new Promise(r => setTimeout(r, 800));
                const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 }).catch(() => null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (!entry || Date.now() - entry.createdTimestamp > 4000) return;
                if (entry.executor?.id === this.client.user?.id) return;

                const protection = this.getGuildProtection(channel.guild.id);
                if (!protection.anti_webhooks?.enabled) return;

                const executor = await channel.guild.members.fetch(entry.executor.id).catch(() => null);
                if (!executor) return;
                if (this.isWhitelisted(executor, protection)) return;

                // Delete the newly created webhook
                const webhooks = await channel.fetchWebhooks().catch(() => null);
                if (webhooks) {
                    const newHook = webhooks.find(w => w.owner?.id === entry.executor.id);
                    if (newHook) await newHook.delete('Anti-webhook: unauthorized').catch(() => {});
                }

                await this.applyAction(channel.guild, executor, protection.anti_webhooks.action, 'Anti-webhook: unauthorized webhook created');
                logger.protection('Anti-webhook: unauthorized webhook creation', {
                    executor: executor.user.tag, executorId: executor.id, guildId: channel.guild.id,
                });
            } catch (e) {
                logger.error('Protection webhookUpdate error', { category: 'protection', error: e.message, stack: e.stack });
            }
        });

        logger.discord('Protection system loaded');
    },

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Get the merged protection config for a specific guild.
     * Guild-level overrides (dashboard saves) take precedence over global defaults.
     */
    getGuildProtection(guildId) {
        const globalSettings  = settingsUtil.get();
        const globalProtection = globalSettings.protection || {};
        const guildProtection  = guildDb.read(guildId, 'protection', null);

        // If the guild has no per-guild config, fall back entirely to global
        if (!guildProtection) return globalProtection;

        // Deep merge: guild values override global, but missing guild keys fall back to global
        const merged = {};
        const keys = new Set([...Object.keys(globalProtection), ...Object.keys(guildProtection)]);
        for (const k of keys) {
            if (typeof globalProtection[k] === 'object' && !Array.isArray(globalProtection[k]) &&
                typeof guildProtection[k]  === 'object' && !Array.isArray(guildProtection[k])) {
                merged[k] = Object.assign({}, globalProtection[k], guildProtection[k]);
            } else {
                merged[k] = (k in guildProtection) ? guildProtection[k] : globalProtection[k];
            }
        }
        return merged;
    },

    isWhitelisted(member, protection) {
        if (!member) return false;
        if (member.id === this.client.user?.id) return true;
        // Support both 'whitelist_roles' (legacy) and 'global_roles' (dashboard)
        const whitelistRoles = [
            ...(protection.whitelist_roles || []),
            ...(protection.global_roles    || [])
        ];
        if (whitelistRoles.length === 0) return false;
        return whitelistRoles.some(roleId => member.roles?.cache?.has(roleId));
    },

    trackAction(guildId, userId, eventType) {
        const key = `${guildId}-${userId}-${eventType}`;
        const now = Date.now();
        if (!actionTrackers.has(key) || actionTrackers.get(key).resetAt <= now) {
            actionTrackers.set(key, { count: 1, resetAt: now + WINDOW_MS });
        } else {
            actionTrackers.get(key).count++;
        }
        return actionTrackers.get(key).count;
    },

    resetTracker(guildId, userId, eventType) {
        actionTrackers.delete(`${guildId}-${userId}-${eventType}`);
    },

    async handleEvent(guild, executorUser, protectionKey, revertFn) {
        try {
            const protection = this.getGuildProtection(guild.id);
            const config = protection[protectionKey];
            if (!config?.enabled) return;

            const member = await guild.members.fetch(executorUser.id).catch(() => null);
            if (!member) return;
            if (this.isWhitelisted(member, protection)) return;

            const count = this.trackAction(guild.id, executorUser.id, protectionKey);
            const limit = config.limit || 5;

            if (count >= limit) {
                this.resetTracker(guild.id, executorUser.id, protectionKey);

                if (revertFn) {
                    await revertFn().catch(() => {});
                }

                await this.applyAction(guild, member, config.action, `Protection: ${protectionKey} limit exceeded (${count}/${limit})`);
                logger.protection(`${protectionKey} triggered`, {
                    executor: executorUser.tag, executorId: executorUser.id,
                    guildId: guild.id, count, limit,
                });
            }
        } catch (e) {
            logger.error(`Protection handleEvent (${protectionKey}) error`, { category: 'protection', error: e.message, stack: e.stack });
        }
    },

    async applyAction(guild, member, action, reason) {
        try {
            switch (String(action)) {
                case '1': // Kick
                    await member.kick(reason).catch(() => {});
                    logger.protection(`Kicked ${member.user.tag}`, { userId: member.id, guildId: guild.id, reason });
                    break;
                case '2': // Remove all roles
                    await member.roles.set([], reason).catch(() => {});
                    logger.protection(`Removed all roles from ${member.user.tag}`, { userId: member.id, guildId: guild.id, reason });
                    break;
                case '3': // Ban
                    await guild.bans.create(member.id, { reason }).catch(() => {});
                    logger.protection(`Banned ${member.user.tag}`, { userId: member.id, guildId: guild.id, reason });
                    break;
                default:
                    logger.warn(`Protection: unknown action value: ${action}`, { category: 'protection', guildId: guild.id });
            }
        } catch (e) {
            logger.error('Protection applyAction error', { category: 'protection', error: e.message, stack: e.stack });
        }
    }
};


/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */