const logger = require('../utils/logger');
﻿/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */

module.exports = {
    name: 'afk',

    execute(client) {
        // AFK entries are stored in MongoDB (AFK collection) with a 7-day TTL index.
        // Expiry is handled automatically by MongoDB — no manual cleanup needed here.
        logger.info('[system] AFK system loaded');
    },
};

/*
 * This project was programmed by the Next Generation team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/BhJStSa89s
 */