'use strict';

const express = require('express');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const config = require('../../config/config');

const router = express.Router();

passport.use(
  new DiscordStrategy(
    {
      clientID: config.bot.clientId,
      clientSecret: config.bot.clientSecret,
      callbackURL: config.dashboard.callbackUrl,
      scope: ['identify', 'guilds'],
    },
    (_accessToken, _refreshToken, profile, done) => {
      return done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

router.get('/discord', passport.authenticate('discord'));

router.get(
  '/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/');
  });
});

module.exports = router;
