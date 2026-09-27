/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */

const cron = require('node-cron');
const { pool } = require('../db/connection');

async function runNightlyCleanup() {
  console.log('[Scheduler] Running nightly cleanup...');
  const expired = await pool.query(
    `DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used = TRUE`
  );
  console.log(`[Scheduler] Deleted ${expired.rowCount} expired/used reset tokens`);

  // Remove old push subscriptions with no activity (optional housekeeping)
  // Uncomment if needed:
  // await pool.query(
  //   `DELETE FROM push_subscriptions WHERE created_at < NOW() - INTERVAL '180 days'`
  // );

  console.log('[Scheduler] Nightly cleanup complete');
}

function startScheduler() {
  // Nightly cleanup at 2:00 AM UTC
  cron.schedule('0 2 * * *', async () => {
    try {
      await runNightlyCleanup();
    } catch (err) {
      console.error('[Scheduler] Cleanup error:', err.message);
    }
  }, { timezone: 'UTC' });

  console.log('[Scheduler] Nightly cleanup job scheduled (2:00 AM UTC)');
}

module.exports = { startScheduler, runNightlyCleanup };
