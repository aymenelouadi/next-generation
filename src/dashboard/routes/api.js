'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const Guild = require('../../database/models/Guild');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(apiLimiter);

/**
 * Returns guild settings as JSON.
 * GET /api/guild/:guildId
 */
router.get('/guild/:guildId', async (req, res) => {
  try {
    const settings = await Guild.findOne({ guildId: req.params.guildId });
    if (!settings) return res.status(404).json({ error: 'Guild not found' });
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
