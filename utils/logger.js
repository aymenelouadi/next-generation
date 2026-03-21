/*
 * utils/logger.js — Winston logger
 * ─────────────────────────────────────────────────────────────────────────────
 * Central logging utility.  All important events and errors are written to:
 *   logs/combined.log  — everything (info and above)
 *   logs/error.log     — errors only
 *   logs/warn.log      — warnings and errors
 *   logs/discord.log   — Discord / bot lifecycle events
 *   logs/db.log        — Database / MongoDB events
 *   logs/protection.log — Security / protection system events
 *
 * Console output uses coloured text in development, plain JSON in production.
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Bot is starting…');
 *   logger.error('Something broke', { error: err.message, stack: err.stack });
 *   logger.discord('User ran command', { userId, command });
 *   logger.db('Connected to MongoDB');
 *   logger.protection('Anti-ban triggered', { guildId, executorId });
 *   logger.warn('Rate limit approaching', { remaining });
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const winston = require('winston');

// ── Ensure logs/ directory exists ─────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ── Custom log levels ─────────────────────────────────────────────────────────
// Extends default npm levels:  error(0) warn(1) info(2) http(3) verbose(4) debug(5) silly(6)
// We keep the same numbers so existing level filtering still works.
const LEVELS = {
    error:      0,
    warn:       1,
    info:       2,
    discord:    2,   // same priority as info
    db:         2,
    protection: 2,
    http:       3,
    verbose:    4,
    debug:      5,
};

const LEVEL_COLORS = {
    error:      'red',
    warn:       'yellow',
    info:       'cyan',
    discord:    'magenta',
    db:         'blue',
    protection: 'red bold',
    http:       'green',
    verbose:    'white',
    debug:      'grey',
};

winston.addColors(LEVEL_COLORS);

// ── Formatters ────────────────────────────────────────────────────────────────
const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format;

/** Plain-text line format used for console output */
const consoleFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    splat(),
    printf(({ level, message, timestamp: ts, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length
            ? ' ' + JSON.stringify(meta)
            : '';
        return `[${ts}] ${level}: ${stack || message}${metaStr}`;
    })
);

/** JSON format used for log files (machine-readable, easy to parse) */
const fileFormat = combine(
    timestamp(),
    errors({ stack: true }),
    splat(),
    json()
);

// ── Transports ────────────────────────────────────────────────────────────────

/** Helper: create a rotating DailyRotateFile-like setup using the built-in File transport.
 *  Files are named <name>.log (current) and rolled by winston automatically at maxsize. */
function fileTransport(filename, level, options = {}) {
    return new winston.transports.File({
        filename:  path.join(LOG_DIR, filename),
        level,
        format:    fileFormat,
        maxsize:   10 * 1024 * 1024, // 10 MB
        maxFiles:  7,                 // keep 7 rotated files
        tailable:  true,
        ...options,
    });
}

// ── Create the logger ─────────────────────────────────────────────────────────
const logger = winston.createLogger({
    levels:      LEVELS,
    level:       process.env.LOG_LEVEL || 'debug',
    exitOnError: false,
    transports: [
        // Console — always present
        new winston.transports.Console({
            level:  process.env.NODE_ENV === 'production' ? 'info' : 'debug',
            format: consoleFormat,
        }),

        // ── File transports ────────────────────────────────────────────────
        // All logs (info+)
        fileTransport('combined.log', 'debug'),

        // Errors only
        fileTransport('error.log', 'error'),

        // Warnings + errors
        fileTransport('warn.log', 'warn'),

        // Discord / bot lifecycle
        fileTransport('discord.log', 'discord'),

        // Database / MongoDB
        fileTransport('db.log', 'db'),

        // Protection / security
        fileTransport('protection.log', 'protection'),
    ],
});

// ── Convenience wrappers that also tag a `category` field ────────────────────
/**
 * Log a Discord-related event (bot lifecycle, command execution, guild events).
 * @param {string} message
 * @param {object} [meta]
 */
logger.discord = (message, meta = {}) =>
    logger.log('discord', message, { category: 'discord', ...meta });

/**
 * Log a database / MongoDB event.
 * @param {string} message
 * @param {object} [meta]
 */
logger.db = (message, meta = {}) =>
    logger.log('db', message, { category: 'db', ...meta });

/**
 * Log a protection / security event (anti-ban, anti-kick, etc.).
 * @param {string} message
 * @param {object} [meta]
 */
logger.protection = (message, meta = {}) =>
    logger.log('protection', message, { category: 'protection', ...meta });

// ── Unhandled rejection / exception integration ───────────────────────────────
// These fire BEFORE Node.js exits so the logs are flushed.
process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled Promise Rejection', {
        category: 'process',
        error:    err.message,
        stack:    err.stack,
    });
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception — process will exit', {
        category: 'process',
        error:    err.message,
        stack:    err.stack,
    });
    // Give Winston a moment to flush before exiting
    setTimeout(() => process.exit(1), 500);
});

module.exports = logger;
