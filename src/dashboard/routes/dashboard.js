'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(dashboardLimiter);

/**
 * Middleware that ensures the user is authenticated.
 */
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth/discord');
}

// Dashboard home — lists guilds the user manages
router.get('/', isAuthenticated, (req, res) => {
// MANAGE_GUILD permission bit (0x20) — only show guilds the user can manage
  const guilds = req.user.guilds?.filter(
    (g) => (BigInt(g.permissions) & BigInt(0x20)) === BigInt(0x20)
  );
  res.render('dashboard/index', { user: req.user, guilds });
});

// Guild settings page
router.get('/guild/:guildId', isAuthenticated, async (req, res) => {
  const { guildId } = req.params;
  const Guild = require('../../database/models/Guild');

  let settings = await Guild.findOne({ guildId });
  if (!settings) settings = await Guild.create({ guildId });

  res.render('dashboard/guild', { user: req.user, settings });
});

module.exports = router;
