/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */

const path = require('path');
const fs   = require('fs');

const SUPPORTED = ['ar', 'en'];
const DEFAULT   = 'ar';
const LANG_DIR  = path.join(__dirname, '../lang');

const cache = {};

function load(lang) {
    if (cache[lang]) return cache[lang];
    const file = path.join(LANG_DIR, `${lang}.json`);
    if (!fs.existsSync(file)) return load(DEFAULT);
    try {
        cache[lang] = JSON.parse(fs.readFileSync(file, 'utf8'));
        return cache[lang];
    } catch {
        return load(DEFAULT);
    }
}

/**
 * Express middleware — reads ?lang= or session.lang, falls back to DEFAULT.
 * Attaches `req.t` (translations) and `req.lang` to every request.
 */
function langMiddleware(req, res, next) {
    // Priority: query param → session → default
    if (req.query.lang && SUPPORTED.includes(req.query.lang)) {
        req.session.lang = req.query.lang;
    }
    const lang  = req.session?.lang || DEFAULT;
    req.lang    = lang;
    req.t       = load(lang);
    res.locals.t    = req.t;
    res.locals.lang = lang;
    res.locals.supported = SUPPORTED;
    next();
}

module.exports = { langMiddleware, load, SUPPORTED, DEFAULT };


/*
 * This project was programmed by the Code Nexus team.
 * If you encounter any problems, open an Issue or log into the Discord server:
 * https://discord.gg/UvEYbFd2rj
 */