require('dotenv').config();

const { startBot } = require('./src/bot/handlers/botHandler');
const { startDashboard } = require('./src/dashboard/routes/server');
const { connectDatabase } = require('./src/database/connection');

async function main() {
  try {
    await connectDatabase();
    await startBot();
    await startDashboard();
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

main();
