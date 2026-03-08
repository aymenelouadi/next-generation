'use strict';

/**
 * Application configuration loaded from environment variables.
 * All values are sourced from the .env file (see .env.example).
 */
const config = {
  bot: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    ownerId: process.env.OWNER_ID,
    prefix: process.env.BOT_PREFIX || '!',
  },
  dashboard: {
    port: parseInt(process.env.DASHBOARD_PORT, 10) || 3000,
    url: process.env.DASHBOARD_URL || 'http://localhost:3000',
    callbackUrl: process.env.CALLBACK_URL || 'http://localhost:3000/auth/discord/callback',
    sessionSecret: process.env.SESSION_SECRET,
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/discord-bot',
  },
};

module.exports = config;
