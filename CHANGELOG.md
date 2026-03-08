# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v5.0.0] — 2026-03-08 🚀 Initial Public Release

### ✨ Features

#### 🤖 Discord Bot
- **Dual command support** — both slash commands (`/`) and prefix text commands (`!`) out of the box
- **Multi-language system** — English and Arabic UI via a configurable `lang` setting per guild
- **Activity & status** — configurable bot activity type and presence status from `settings.json`

#### 🛡️ Protection System
- **Anti-Ban** — detects and reverses mass-ban events; punishes the responsible member
- **Anti-Kick** — detects and reverses mass-kick events with configurable action
- **Anti-Bots** — blocks automatic bot additions to the guild
- **Anti-Webhooks** — prevents mass webhook creation
- **Anti-Channel Create / Delete** — protects channel structure from rapid create/delete
- **Anti-Role Add / Delete** — protects role structure from mass mutations
- **Whitelist system** — trusted users/roles exempt from all protection triggers
- **Jail system** — isolates members into a locked room with configurable jail role and channel
- **Mute system** — temporary mute with automatic role restore via database-backed scheduler

#### 📋 Moderation Commands
- `ban` / `unban` / `unban_all` — ban management with reason logging
- `kick` — kick with log
- `mute` / `unmute` — mute with duration support
- `warn` / `unwarn` / `warning` — full warning system with per-user history
- `jail` / `unjail` — jail isolation
- `clear` — bulk message deletion (1–100 messages)
- `lock` / `unlock` — channel lockdown
- `slowmode` — set channel slowmode delay
- `rename` — rename channels or members
- `say` — send a message as the bot

#### 👥 Role Management
- `add_role` / `remove_role` — add or remove a single role from a member
- `multipe_role` — apply a role to all members matching a filter
- `temp_role` — assign a role for a defined duration; auto-removed on expiry
- `auto_role` — automatically assign roles to new human members, bots, or via invite link
- `roles` — list all roles in the server  
- `set_perm` / `set_perm_all` / `set_perm_reset` — fine-grained command permission control per role

#### 🎟️ Ticket System
- Multi-panel ticket support with configurable category, role, and emoji per panel
- Ticket transcript generation (HTML export)
- Ticket feedback collection on close
- Ticket statistics tracking
- Ticket log channel support
- Post-close actions (archive, delete, notify)

#### 📊 Utility & Info
- `server` — server information embed
- `user` — user profile (avatar, join date, roles, badges)
- `avatar` / `banner_user` / `banner_server` / `logo_server` — media fetch commands
- `ping` — bot latency and API ping
- `afk` — set AFK status with custom message; auto-cleared on next message
- `come` — summon the bot to your voice channel
- `help` — dynamic help command listing all enabled commands

#### ⚖️ Court / Complaint System
- `court_set_name` / `court_set_color` / `court_set_logo` / `court_set_log` — configure the court module
- Embedded complaint management with status tracking

#### 🔔 Logging System
- Comprehensive action log channel — tracks bans, kicks, mutes, role changes, command usage, and more
- Per-guild log channel configurable via `settings.json` or dashboard

#### 🌐 Web Dashboard
- Express + EJS dashboard served separately from the bot process
- Discord OAuth2 login
- Guild selector with permission check
- **Pages:**
  - Home / Server overview
  - Auto Roles — manage human, bot, and invite-based auto-assign rules
  - Moderation — review warnings, bans, and mod log
  - Protection — configure all anti-* modules with live toggle
  - Ticket System — manage panels, categories, and settings
  - Levels — XP and level tracking configuration
  - System Settings — prefix, language, activity, whitelist
  - Utility settings
  - Verify system

#### ⚙️ Configuration
- `settings.json` — single-file guild configuration for all modules
- `database/` — flat JSON file database for persistent state (warnings, mutes, jails, temp roles, afk, auto roles, tickets)
- `.env` — environment secrets (token, client secret, session key)

### 🏗️ Technical Stack

| Layer | Technology |
|-------|-----------|
| Bot runtime | Node.js ≥ 20, discord.js v14 |
| Dashboard | Express 5, EJS 4, Socket.IO |
| Auth | Discord OAuth2 |
| Database | Flat-file JSON (fs-extra) |
| UI components | Lucide icons, ApexCharts, Three.js |
| Container | Docker (Node 20 Alpine) |

---

> This project was programmed by the Code Nexus team.  
> Discord: https://discord.gg/UvEYbFd2rj
