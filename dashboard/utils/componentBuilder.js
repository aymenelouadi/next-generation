/*
 * Next Generation — Component Builder Utility
 * Converts ComponentMessage data into a Discord.js Components V2 message payload.
 *
 * Discord Components V2 reference:
 *   Type  1 = ActionRow   (buttons / select menus inside it)
 *   Type  2 = Button
 *   Type  3 = StringSelect
 *   Type 10 = TextDisplay  – plain text block
 *   Type 12 = MediaGallery – image(s)
 *   Type 14 = Separator    – horizontal rule / spacing  (spacing: 1=Small, 2=Large)
 *   Type 17 = Container    – visual group with optional accent_color
 *
 * REQUIRED: message must carry flags: MessageFlags.IsComponentsV2 (32768)
 */

'use strict';

const {
    ActionRowBuilder,
    ButtonBuilder,
    StringSelectMenuBuilder,
    ButtonStyle,
    StringSelectMenuOptionBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ContainerBuilder,
    MessageFlags,
} = require('discord.js');

const BUTTON_STYLE_MAP = {
    Primary:   ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success:   ButtonStyle.Success,
    Danger:    ButtonStyle.Danger,
    Link:      ButtonStyle.Link,
};

/** Convert a stored row into its discord.js builder, or null to skip. */
function buildRow(row) {
    // ── Action Row: Buttons ───────────────────────────────────────────────
    if (row.type === 'buttons') {
        const buttons = (row.buttons || []).slice(0, 5);
        if (!buttons.length) return null;
        const ar = new ActionRowBuilder();
        ar.addComponents(buttons.map(b => {
            const btn = new ButtonBuilder()
                .setLabel((b.label || 'Button').slice(0, 80))
                .setStyle(BUTTON_STYLE_MAP[b.style] || ButtonStyle.Primary);
            if (b.style === 'Link') {
                btn.setURL(b.url?.trim() || 'https://discord.com');
            } else {
                btn.setCustomId(b.customId);
            }
            if (b.emoji) { try { btn.setEmoji(b.emoji); } catch (_) {} }
            if (b.disabled) btn.setDisabled(true);
            return btn;
        }));
        return ar;
    }

    // ── Action Row: Select Menu ───────────────────────────────────────────
    if (row.type === 'select' && row.select) {
        const s = row.select;
        const validOpts = (s.options || []).slice(0, 25).filter(o => o.value?.trim());
        if (!validOpts.length) return null;
        const menu = new StringSelectMenuBuilder()
            .setCustomId(s.customId)
            .setPlaceholder((s.placeholder || 'Select an option…').slice(0, 150))
            .setMinValues(Math.min(s.minValues ?? 1, validOpts.length))
            .setMaxValues(Math.min(s.maxValues ?? 1, validOpts.length));
        if (s.disabled) menu.setDisabled(true);
        menu.addOptions(validOpts.map(o => {
            const opt = new StringSelectMenuOptionBuilder()
                .setLabel((o.label || 'Option').slice(0, 100))
                .setValue(o.value.slice(0, 100));
            if (o.description) opt.setDescription(o.description.slice(0, 100));
            if (o.emoji) { try { opt.setEmoji(o.emoji); } catch (_) {} }
            if (o.default) opt.setDefault(true);
            return opt;
        }));
        const ar = new ActionRowBuilder().addComponents(menu);
        return ar;
    }

    // ── TextDisplay (type 10) ─────────────────────────────────────────────
    if (row.type === 'text_display') {
        const text = (row.text || '').trim();
        if (!text) return null;
        return new TextDisplayBuilder().setContent(text.slice(0, 4000));
    }

    // ── Separator (type 14) ───────────────────────────────────────────────
    if (row.type === 'separator') {
        const sep = new SeparatorBuilder().setDivider(row.divider !== false);
        sep.setSpacing(row.spacing === 'Large' ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
        return sep;
    }

    // ── Image → MediaGallery (type 12) ────────────────────────────────────
    if (row.type === 'image') {
        const url = (row.url || '').trim();
        if (!url) return null;
        const item = new MediaGalleryItemBuilder().setURL(url);
        if (row.description) item.setDescription(row.description.slice(0, 512));
        return new MediaGalleryBuilder().addItems(item);
    }

    // ── Container (type 17) ───────────────────────────────────────────────
    if (row.type === 'container') {
        const cnt = new ContainerBuilder();
        if (row.accentColor) {
            try {
                const colorInt = parseInt(String(row.accentColor).replace(/^#/, ''), 16);
                if (!isNaN(colorInt)) cnt.setAccentColor(colorInt);
            } catch (_) {}
        }
        let childCount = 0;
        for (const child of (row.children || [])) {
            if (child.type === 'container') continue; // no nesting
            const built = buildRow(child);
            if (!built) continue;
            const json = built.toJSON();
            switch (json.type) {
                case 1:  cnt.addActionRowComponents(built);    break; // buttons / select
                case 10: cnt.addTextDisplayComponents(built);  break; // text_display
                case 12: cnt.addMediaGalleryComponents(built); break; // image
                case 14: cnt.addSeparatorComponents(built);    break; // separator
            }
            childCount++;
        }
        // Container requires at least one child to be valid
        if (childCount === 0) cnt.addTextDisplayComponents(new TextDisplayBuilder().setContent('\u200b'));
        return cnt;
    }

    return null;
}

/**
 * Build a Discord.js Components V2 message payload.
 * @param {object} doc  – { content: string, components: ComponentRow[] }
 * @returns {{ components: Builder[], flags: number }}
 */
function buildComponentPayload(doc) {
    const components = [];

    // IS_COMPONENTS_V2 forbids the top-level `content` field.
    // Prepend it as a TextDisplay instead so it still appears in the message.
    if (doc.content?.trim()) {
        components.push(new TextDisplayBuilder().setContent(doc.content.trim().slice(0, 4000)));
    }

    for (const row of (doc.components || [])) {
        const built = buildRow(row);
        if (built) components.push(built);
    }

    return {
        // No 'content' field — forbidden with IS_COMPONENTS_V2
        components,
        flags: MessageFlags.IsComponentsV2,
    };
}

module.exports = { buildComponentPayload };
