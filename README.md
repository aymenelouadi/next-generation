<div align="center">

# 🤖 Discord Bot Dashboard — ALL IN ONE Next Generation

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=for-the-badge)](LICENSE)

A powerful, all-in-one Discord bot with a full-featured web dashboard built with Node.js, Discord.js v14, and Express.

</div>

---

## 📋 Table of Contents

- [Features](#-features)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Project](#-running-the-project)
- [Available Commands](#-available-commands)
- [Dashboard](#-dashboard)
- [Contributing](#-contributing)
- [Security](#-security)
- [License](#-license)

---

## ✨ Features

- **🤖 Discord Bot**
  - Slash commands (Discord.js v14)
  - Moderation commands (ban, kick, mute, warn)
  - Music playback
  - Fun and utility commands
  - Auto-moderation and anti-spam
  - Welcome / leave messages
  - Custom prefix support

- **📊 Web Dashboard**
  - Real-time bot statistics
  - Guild management interface
  - Command configuration per server
  - Role and permission management
  - Logging and audit log viewer
  - Responsive design (mobile-friendly)

- **🗄️ Database**
  - MongoDB integration with Mongoose
  - Per-guild configuration storage
  - User data and economy system

---

## 📁 Project Structure

```
Bot-Discord-Dashboard-ALL-IN-ONE---Next-Generation/
├── src/
│   ├── bot/
│   │   ├── commands/          # Slash & prefix commands
│   │   │   ├── moderation/    # Ban, kick, mute, warn
│   │   │   ├── music/         # Music playback commands
│   │   │   ├── fun/           # Fun commands
│   │   │   └── utility/       # Utility commands
│   │   ├── events/            # Discord.js event handlers
│   │   └── handlers/          # Command & event loaders
│   ├── dashboard/
│   │   ├── routes/            # Express route handlers
│   │   ├── views/             # EJS/HTML templates
│   │   └── public/            # Static assets (CSS, JS, images)
│   ├── database/
│   │   ├── models/            # Mongoose data models
│   │   └── connection.js      # Database connection setup
│   ├── config/
│   │   └── config.js          # Application configuration
│   └── utils/                 # Shared utility functions
├── .github/
│   ├── ISSUE_TEMPLATE/        # GitHub issue templates
│   └── PULL_REQUEST_TEMPLATE.md
├── .env.example               # Example environment variables
├── index.js                   # Application entry point
├── package.json
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

---

## 📦 Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [npm](https://www.npmjs.com/) v8 or higher
- [MongoDB](https://www.mongodb.com/) v5 or higher (local or [Atlas](https://www.mongodb.com/atlas))
- A Discord application & bot token from the [Discord Developer Portal](https://discord.com/developers/applications)

---

## 🚀 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/aymenelouadi/Bot-Discord-Dashboard-ALL-IN-ONE---Next-Generation.git
   cd Bot-Discord-Dashboard-ALL-IN-ONE---Next-Generation
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Copy the example environment file**

   ```bash
   cp .env.example .env
   ```

4. **Fill in your configuration** (see [Configuration](#-configuration))

---

## ⚙️ Configuration

Edit the `.env` file with your own values:

```env
# Discord Bot
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
CLIENT_SECRET=your_client_secret_here

# Dashboard
SESSION_SECRET=a_long_random_secret_string
DASHBOARD_PORT=3000
CALLBACK_URL=http://localhost:3000/auth/discord/callback

# Database
MONGODB_URI=mongodb://localhost:27017/discord-bot

# Optional: Bot settings
BOT_PREFIX=!
OWNER_ID=your_discord_user_id
```

> ⚠️ **Never commit your `.env` file.** It is already listed in `.gitignore`.

---

## ▶️ Running the Project

**Development mode** (with auto-restart via nodemon):

```bash
npm run dev
```

**Production mode:**

```bash
npm start
```

**Register slash commands** with Discord:

```bash
npm run deploy-commands
```

---

## 🤖 Available Commands

| Category    | Command        | Description                         |
|-------------|----------------|-------------------------------------|
| Moderation  | `/ban`         | Ban a member from the server        |
| Moderation  | `/kick`        | Kick a member from the server       |
| Moderation  | `/mute`        | Timeout a member                    |
| Moderation  | `/warn`        | Issue a warning to a member         |
| Utility     | `/help`        | Show all available commands         |
| Utility     | `/ping`        | Check the bot's latency             |
| Utility     | `/serverinfo`  | Show information about the server   |
| Utility     | `/userinfo`    | Show information about a user       |
| Fun         | `/8ball`       | Ask the magic 8-ball               |
| Fun         | `/meme`        | Get a random meme                   |

---

## 📊 Dashboard

The web dashboard runs on `http://localhost:3000` (configurable via `DASHBOARD_PORT`).

Login with your Discord account to manage your servers:

1. Navigate to `http://localhost:3000`
2. Click **Login with Discord**
3. Select a server you manage
4. Configure settings, view logs, and manage the bot

---

## 🤝 Contributing

Contributions are welcome! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to submit pull requests, report issues, and suggest improvements.

---

## 🔒 Security

If you discover a security vulnerability, please follow our responsible disclosure process outlined in [SECURITY.md](SECURITY.md). **Do not** open a public issue for security vulnerabilities.

---

## 📄 License

This project is licensed under the [Apache License 2.0](LICENSE).

---

<div align="center">

Made with ❤️ by [aymenelouadi](https://github.com/aymenelouadi)

</div>
