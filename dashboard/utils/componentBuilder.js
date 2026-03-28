/*
 * Next Generation — Component Builder Utility
 * Converts ComponentMessage data into a Discord.js-compatible message payload.
 */

'use strict';

const { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, StringSelectMenuOptionBuilder } = require('discord.js');

const STYLE_MAP = {
    Primary:   ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success:   ButtonStyle.Success,
    Danger:    ButtonStyle.Danger,
    Link:      ButtonStyle.Link,
};

/**
 * Build a Discord.js message payload from a ComponentMessage document.
 * @param {object} doc  { content, components }
 * @returns {{ content: string, components: ActionRowBuilder[] }}
 */
function buildComponentPayload(doc) {
    const content = doc.content || '';

    const components = (doc.components || []).slice(0, 5).map(row => {
        const ar = new ActionRowBuilder();

        if (row.type === 'buttons' && row.buttons?.length) {
            ar.addComponents(row.buttons.slice(0, 5).map(b => {
                const btn = new ButtonBuilder()
                    .setLabel(b.label || 'Button')
                    .setStyle(STYLE_MAP[b.style] || ButtonStyle.Primary);
                if (b.style === 'Link') {
                    btn.setURL(b.url || 'https://discord.com');
                } else {
                    btn.setCustomId(b.customId);
                }
                if (b.emoji) { try { btn.setEmoji(b.emoji); } catch (_) {} }
                if (b.disabled) btn.setDisabled(true);
                return btn;
            }));
        } else if (row.type === 'select' && row.select) {
            const s = row.select;
            const validOptions = (s.options || []).slice(0, 25).filter(o => o.value?.trim());
            if (!validOptions.length) return null;
            const menu = new StringSelectMenuBuilder()
                .setCustomId(s.customId)
                .setPlaceholder(s.placeholder || 'Select an option…')
                .setMinValues(Math.min(s.minValues ?? 1, validOptions.length))
                .setMaxValues(Math.min(s.maxValues ?? 1, validOptions.length));
            if (s.disabled) menu.setDisabled(true);
            menu.addOptions(validOptions.map(o => {
                const opt = new StringSelectMenuOptionBuilder()
                    .setLabel(o.label || 'Option')
                    .setValue(o.value);
                if (o.description) opt.setDescription(o.description.slice(0, 100));
                if (o.emoji) { try { opt.setEmoji(o.emoji); } catch (_) {} }
                if (o.default) opt.setDefault(true);
                return opt;
            }));
            ar.addComponents(menu);
        }

        if (!ar.components.length) return null;
        return ar;
    }).filter(Boolean);

    return { content: content || '\u200b', components };
}

module.exports = { buildComponentPayload };
