/**
 * _fix_console.js — One-time script to migrate all console.* calls to logger
 * Run: node _fix_console.js
 * Delete this file afterwards.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;

// Files to migrate + their relative path to utils/logger.js
const FILES = [
    { rel: 'dashboard/routes/auth.js',       lp: '../../utils/logger' },
    { rel: 'dashboard/utils/cache.js',       lp: '../../utils/logger' },
    { rel: 'dashboard/utils/guildDb.js',     lp: '../../utils/logger' },
    { rel: 'dashboard/utils/lang.js',        lp: '../../utils/logger' },
    { rel: 'systems/actions.js',             lp: '../utils/logger' },
    { rel: 'systems/afk.js',                 lp: '../utils/logger' },
    { rel: 'systems/auto_responder.js',      lp: '../utils/logger' },
    { rel: 'systems/auto_role.js',           lp: '../utils/logger' },
    { rel: 'systems/levels.js',              lp: '../utils/logger' },
    { rel: 'systems/log.js',                 lp: '../utils/logger' },
    { rel: 'systems/set_perm.js',            lp: '../utils/logger' },
    { rel: 'systems/suggestions.js',         lp: '../utils/logger' },
    { rel: 'systems/temp_role.js',           lp: '../utils/logger' },
    { rel: 'systems/tickets.js',             lp: '../utils/logger' },
    { rel: 'systems/ticket_after.js',        lp: '../utils/logger' },
    { rel: 'systems/ticket_feedback.js',     lp: '../utils/logger' },
    { rel: 'systems/ticket_log.js',          lp: '../utils/logger' },
    { rel: 'systems/ticket_transcript.js',   lp: '../utils/logger' },
    { rel: 'utils/settings.js',             lp: './logger' },
];

let totalFiles = 0, totalReplacements = 0;

for (const { rel, lp } of FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) { console.warn(`  SKIP (missing): ${rel}`); continue; }

    let src = fs.readFileSync(fp, 'utf8');

    // ── 1. Inject logger require if not already present ──────────────────
    const requireExpr = `require('${lp}')`;
    if (!src.includes(requireExpr)) {
        // Insert after the first existing require() line, or at the very top
        const firstRequire = /^(?:const|let|var)\s+\S.*?require\(.*\);?\s*$/m;
        const m = firstRequire.exec(src);
        if (m) {
            const insertAt = m.index + m[0].length;
            src = src.slice(0, insertAt) + `\nconst logger = ${requireExpr};` + src.slice(insertAt);
        } else {
            // No existing require — prepend
            src = `const logger = ${requireExpr};\n` + src;
        }
    }

    // ── 2. Replace console.error / console.warn / console.log ───────────
    let count = 0;

    // console.error → logger.error
    src = src.replace(/\bconsole\.error\b/g, () => { count++; return 'logger.error'; });
    // console.warn  → logger.warn
    src = src.replace(/\bconsole\.warn\b/g,  () => { count++; return 'logger.warn'; });
    // console.log   → logger.info  (general info)
    src = src.replace(/\bconsole\.log\b/g,   () => { count++; return 'logger.info'; });

    if (count > 0) {
        fs.writeFileSync(fp, src, 'utf8');
        console.log(`  FIXED  ${rel}  (${count} replacements)`);
        totalFiles++;
        totalReplacements += count;
    } else {
        console.log(`  OK     ${rel}  (nothing to change)`);
    }
}

console.log(`\nDone — ${totalFiles} file(s) updated, ${totalReplacements} replacement(s) total.`);
