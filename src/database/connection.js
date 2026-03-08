'use strict';

const mongoose = require('mongoose');
const config = require('../config/config');

/**
 * Connects to the MongoDB database using the URI from config.
 * @returns {Promise<void>}
 */
async function connectDatabase() {
  try {
    await mongoose.connect(config.database.uri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

module.exports = { connectDatabase };
