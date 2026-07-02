/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */

const sql = require('mssql');

// ── DB config — reads from environment variables ─────────────────
// In dev:  DB_DATABASE = Musik_DB_2026_Dev
// In prod: DB_DATABASE = Musik_DB_2026
const dbConfig = {
  server:           process.env.DB_SERVER,
  database:         process.env.DB_DATABASE,
  user:             process.env.DB_USER,
  password:         process.env.DB_PASSWORD,
  port:             1433,
  connectionTimeout: 30000,   // 30s — handles Azure SQL serverless cold starts
  requestTimeout:    30000,
  pool: {
    max:             10,
    min:             0,
    idleTimeoutMillis: 30000  // release idle connections after 30s
  },
  options: {
    encrypt:                true,
    trustServerCertificate: false,
    enableArithAbort:       true
  }
};

// Single shared pool — reused across all requests
let _pool = null;

async function getPool() {
  // If pool exists and is connected, reuse it
  if (_pool && _pool.connected) return _pool;

  // If pool exists but disconnected, close it cleanly first
  if (_pool) {
    try { await _pool.close(); } catch (_) {}
    _pool = null;
  }

  // Create a new pool with retry for Azure cold starts
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`DB connecting (attempt ${attempts})...`);
      _pool = await sql.connect(dbConfig);
      console.log(`Connected to ${process.env.DB_DATABASE}`);
      return _pool;
    } catch (err) {
      console.error(`DB connect attempt ${attempts} failed:`, err.message);
      if (attempts >= maxAttempts) throw err;
      // Wait 3s before retrying — gives Azure time to wake up
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// ── Keep-alive — only ping on Basic/paid tiers ───────────────────
// Azure SQL serverless auto-pauses after 1hr of inactivity.
// On serverless free tier: let it pause, handle cold start with retry above.
// On Basic tier ($5/mo flat): keep alive to avoid cold starts.
// Set KEEP_ALIVE=true in Railway env vars ONLY if you are on a paid tier.
function startKeepAlive() {
  if (process.env.KEEP_ALIVE !== 'true') {
    console.log('DB keep-alive disabled (serverless mode — cold starts handled by retry)');
    return;
  }
  console.log('DB keep-alive enabled (Basic tier mode)');
  // Ping every 4 minutes to prevent Azure idle timeout
  setInterval(async () => {
    try {
      const pool = await getPool();
      await pool.request().query('SELECT 1');
      console.log('DB keep-alive ping sent');
    } catch (err) {
      console.error('Keep-alive ping failed:', err.message);
      _pool = null; // Force reconnect on next request
    }
  }, 4 * 60 * 1000);
}

module.exports = { getPool, startKeepAlive };
