/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */

/**
 * Shared bot-client reference.
 * Set once the Discord client is ready in index.js,
 * then accessible anywhere in the dashboard.
 */
let _client = null;

function setClient(c) { _client = c; }
function getClient()  { return _client; }

module.exports = { setClient, getClient };


/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */