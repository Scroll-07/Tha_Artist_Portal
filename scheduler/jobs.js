/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */

const cron    = require('node-cron');
const sql     = require('mssql');
const { getPool } = require('../db/connection');

// ── Nightly data cleanup — runs at 2am every night ───────────────
async function runNightlyCleanup() {
  try {
    const pool = await getPool();
    console.log('Running nightly TAP data cleanup...');

    // Fix NULL roles in ArtistLogins
    await pool.request().query(
      "UPDATE ArtistLogins SET Role = 'Artist' WHERE Role IS NULL OR Role = ''"
    );

    // Fix NULL roles in staging
    await pool.request().query(
      "UPDATE Artist_Registration_Staging SET Role = 'Artist' WHERE Role IS NULL OR Role = ''"
    );

    // Link missing Artist_IDs
    await pool.request().query(`
      UPDATE l SET l.Artist_ID = a.Artist_ID
      FROM ArtistLogins l
      JOIN Artists a ON l.Artist_Email = a.Artist_Email
      WHERE l.Artist_ID IS NULL
    `);

    // Sync names and emails between tables
    await pool.request().query(`
      UPDATE a
      SET a.Artist_Name  = l.Artist_Name,
          a.Artist_Email = l.Artist_Email
      FROM Artists a
      JOIN ArtistLogins l ON a.Artist_ID = l.Artist_ID
      WHERE a.Artist_Name  != l.Artist_Name
      OR    a.Artist_Email != l.Artist_Email
    `);

    // Archive old staging records older than 30 days
    await pool.request().query(`
      UPDATE Artist_Registration_Staging
      SET Status = 'Archived'
      WHERE Status IN ('Rejected', 'Approved')
      AND   DATEDIFF(day, Created_At, GETDATE()) > 30
    `);

    // Clean up read notifications older than 60 days
    await pool.request().query(`
      DELETE FROM Notifications
      WHERE Is_Read = 1
      AND DATEDIFF(day, Created_At, GETDATE()) > 60
    `);

    console.log('Nightly cleanup complete.');
  } catch (err) {
    console.error('Nightly cleanup failed:', err.message);
  }
}

// ── Start all scheduled jobs ─────────────────────────────────────
function startScheduler() {
  // Nightly cleanup at 2:00am UTC
  cron.schedule('0 2 * * *', () => {
    console.log('Cron: starting nightly cleanup');
    runNightlyCleanup();
  });

  console.log('Scheduler started — nightly cleanup at 2am UTC');
}

module.exports = { startScheduler, runNightlyCleanup };
