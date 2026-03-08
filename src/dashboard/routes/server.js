'use strict';

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');
const path = require('path');
const config = require('../../config/config');
const authRouter = require('./auth');
const dashboardRouter = require('./dashboard');
const apiRouter = require('./api');

/**
 * Initialises and starts the Express dashboard server.
 * @returns {Promise<void>}
 */
async function startDashboard() {
  const app = express();

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));

  // Static assets
  app.use(express.static(path.join(__dirname, '../public')));

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session management
  app.use(
    session({
      secret: config.dashboard.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: config.database.uri }),
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        httpOnly: true,
        sameSite: 'lax',
        // Require HTTPS in production to protect the session cookie
        secure: process.env.NODE_ENV === 'production',
      },
    })
  );

  // Passport authentication
  app.use(passport.initialize());
  app.use(passport.session());

  // Routes
  app.use('/auth', authRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/api', apiRouter);

  // Home page
  app.get('/', (req, res) => {
    res.render('index', { user: req.user });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).render('404', { user: req.user });
  });

  // Error handler
  app.use((err, req, res, _next) => {
    console.error(err.stack);
    res.status(500).render('500', { user: req.user });
  });

  const port = config.dashboard.port;
  app.listen(port, () => {
    console.log(`✅ Dashboard running at ${config.dashboard.url}`);
  });
}

module.exports = { startDashboard };
