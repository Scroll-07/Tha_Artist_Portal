/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

async function connectWithRetry(attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`DB connecting (attempt ${i})...`);
      const client = await pool.connect();
      client.release();
      console.log('Connected to Railway PostgreSQL');
      return;
    } catch (err) {
      console.error(`DB connect attempt ${i} failed:`, err.message);
      if (i < attempts) await new Promise(r => setTimeout(r, 3000));
      else throw err;
    }
  }
}

function startKeepAlive() {
  if (process.env.KEEP_ALIVE !== 'true') {
    console.log('DB keep-alive disabled (serverless mode)');
    return;
  }
  console.log('DB keep-alive enabled');
  setInterval(async () => {
    try {
      await pool.query('SELECT 1');
      console.log('DB keep-alive ping sent');
    } catch (err) {
      console.error('Keep-alive ping failed:', err.message);
    }
  }, 4 * 60 * 1000);
}

module.exports = { pool, connectWithRetry, startKeepAlive };
