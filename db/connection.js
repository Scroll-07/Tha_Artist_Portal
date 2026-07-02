/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */

const sql = require('mssql');

const dbConfig = {
  server:            process.env.DB_SERVER,
  database:          process.env.DB_DATABASE,
  user:              process.env.DB_USER,
  password:          process.env.DB_PASSWORD,
  port:              1433,
  connectionTimeout: 30000,
  requestTimeout:    30000,
  pool: {
    max:               10,
    min:               0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt:                true,
    trustServerCertificate: false,
    enableArithAbort:       true
  }
};

let _pool       = null;
let _connecting = null;

async function getPool() {
  if (_pool && _pool.connected) return _pool;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    if (_pool) {
      try { await _pool.close(); } catch (_) {}
      _pool = null;
    }
    let attempts = 0;
    while (attempts < 3) {
      try {
        attempts++;
        console.log(`DB connecting (attempt ${attempts})...`);
        _pool = await sql.connect(dbConfig);
        console.log(`Connected to ${process.env.DB_DATABASE}`);
        _connecting = null;
        return _pool;
      } catch (err) {
        console.error(`DB connect attempt ${attempts} failed:`, err.message);
        if (attempts >= 3) { _connecting = null; throw err; }
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  })();

  return _connecting;
}

function startKeepAlive() {
  if (process.env.KEEP_ALIVE !== 'true') {
    console.log('DB keep-alive disabled (serverless mode)');
    return;
  }
  console.log('DB keep-alive enabled');
  setInterval(async () => {
    try {
      const pool = await getPool();
      await pool.request().query('SELECT 1');
      console.log('DB keep-alive ping sent');
    } catch (err) {
      console.error('Keep-alive ping failed:', err.message);
      _pool = null;
    }
  }, 4 * 60 * 1000);
}

module.exports = { getPool, startKeepAlive };
