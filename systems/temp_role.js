/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */

'use strict';

const db = require('../systems/schemas');

const logger = require('../utils/logger');
module.exports = {
    name: 'temp-role-system',

    execute(client) {
        this.client = client;
        this.checkExpiredRoles();

        setInterval(() => {
            this.checkExpiredRoles();
        }, 30_000);

        logger.info('Temporary Role System has been loaded');
    },

    async checkExpiredRoles() {
        try {
            const mongoose = require('mongoose');
            if (mongoose.connection.readyState !== 1) return;

            const expired = await db.TempRole.find({
                active: true,
                expiresAt: { $lte: new Date() },
            }).lean().maxTimeMS(8_000);

            for (const record of expired) {
                try {
                    const guild = await this.client.guilds.fetch(record.guildId).catch(() => null);
                    if (!guild) { await db.TempRole.findByIdAndUpdate(record._id, { active: false }); continue; }

                    const member = await guild.members.fetch(record.userId).catch(() => null);
                    if (member && member.roles.cache.has(record.roleId)) {
                        await member.roles.remove(record.roleId, 'Temp role expired').catch(() => {});
                        try {
                            const role = guild.roles.cache.get(record.roleId);
                            await member.send(
                                `⚠️ انتهت مدة الرتبة المؤقتة\nتم إزالة رتبة **${role?.name || record.roleId}** من سيرفر **${guild.name}**`
                            );
                        } catch (_) {}
                        logger.info(`[TempRole] Removed role ${record.roleId} from ${record.userId} in ${record.guildId}`);
                    }

                    await db.TempRole.findByIdAndUpdate(record._id, { active: false });
                } catch (e) {
                    logger.error(`[TempRole] Error processing record ${record._id}: ${e?.message || e}`);
                }
            }
        } catch (e) {
            const msg = e?.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
            // Ignore transient network/timeout errors silently — mongo will auto-reconnect
            if (/timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|monitor/i.test(msg)) return;
            logger.error(`[TempRole] checkExpiredRoles error: ${msg}`);
        }
    },
};

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */