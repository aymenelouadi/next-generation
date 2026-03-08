/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */

const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'set-perm-system',
    
    execute(client) {
        console.log('Permission Management System has been loaded');
        
        client.on('interactionCreate', async (interaction) => {
            if (interaction.isButton()) {
                const command = client.commands.get('set_perm');
                if (command && interaction.customId.startsWith('perm_')) {
                    await command.handleButton(interaction);
                }
            }
            
            if (interaction.isStringSelectMenu()) {
                const command = client.commands.get('set_perm');
                if (command && interaction.customId.startsWith('perm_')) {
                    await command.handleSelectMenu(interaction);
                }
            }
        });
    }
};

/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */