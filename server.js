/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const webpush  = require('web-push');

const { pool, connectWithRetry, startKeepAlive } = require('./db/connection');
const { startScheduler, runNightlyCleanup }      = require('./scheduler/jobs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Resend setup ─────────────────────────────────────────────────
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Web Push (VAPID) setup ────────────────────────────────────────
webpush.setVapidDetails(
  'mailto:' + process.env.FROM_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ── Auth middleware ───────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'No token provided.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.artist = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

// ── Email helper ──────────────────────────────────────────────────
async function sendEmail(to, subject, htmlContent) {
  try {
    await resend.emails.send({
      from:    process.env.FROM_EMAIL,
      to,
      subject,
      html:    htmlContent
    });
    console.log('Email sent to:', to);
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

// ── Push notification helper ──────────────────────────────────────
async function sendPushToUser(loginId, title, body, url) {
  try {
    const result = await pool.query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE login_id = $1',
      [loginId]
    );
    if (!result.rows.length) return;

    const payload = JSON.stringify({ title, body, url: url || '/dashboard.html' });

    for (const sub of result.rows) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query(
            'DELETE FROM push_subscriptions WHERE endpoint = $1',
            [sub.endpoint]
          );
          console.log('Removed expired push subscription');
        }
      }
    }
  } catch (err) {
    console.error('Push notification failed:', err.message);
  }
}

// ── Notification helper ───────────────────────────────────────────
async function createNotification(recipientId, senderId, senderName,
                                   type, message, link, recipientEmail) {
  // Save in-app notification
  await pool.query(
    `INSERT INTO notifications
      (recipient_id, sender_id, sender_name, type, message, link)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [recipientId, senderId || null, senderName || null, type, message || null, link || null]
  );

  // Get recipient notification preferences
  let prefs = null;
  try {
    const prefResult = await pool.query(
      'SELECT * FROM notification_preferences WHERE login_id = $1',
      [recipientId]
    );
    prefs = prefResult.rows[0];
  } catch (_) {}

  const emailEnabled = !prefs || prefs.email_alerts === true;
  const pushEnabled  = !prefs || prefs.push_enabled !== false;

  // Send push notification
  if (pushEnabled) {
    const pushTitles = {
      'collab_request':  'New Collab Request 🎵',
      'new_message':     'New Message 💬',
      'collab_accepted': 'Collab Request Accepted ✅',
      'collab_declined': 'Collab Request Declined',
      'profile_view':    'Someone Viewed Your Profile 👀'
    };
    await sendPushToUser(
      recipientId,
      pushTitles[type] || 'New Notification',
      message,
      link || '/dashboard.html'
    );
  }

  // Send email notification
  if (emailEnabled && recipientEmail) {
    try {
      const subjects = {
        'collab_request':  senderName + ' sent you a collab request on TAP',
        'new_message':     senderName + ' sent you a message on TAP',
        'collab_accepted': 'Your collab request was accepted by ' + senderName,
        'collab_declined': 'Your collab request was declined by ' + senderName,
        'profile_view':    senderName + ' viewed your TAP profile'
      };
      const subject = subjects[type] || 'New notification from ' + senderName + ' on TAP';
      const html = `
        <div style="font-family:Arial;max-width:500px;margin:0 auto;
          background:#111;color:#eee;padding:32px;border-radius:12px;">
          <h1 style="color:#D4AF37;margin-bottom:8px;">Tha Artist Portal</h1>
          <p style="color:#888;margin-bottom:24px;">Your data. Your leverage.</p>
          <div style="background:#1a1a1a;border-left:4px solid #D4AF37;
            border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="color:#eee;font-size:1rem;margin:0;">${message}</p>
          </div>
          <a href="${process.env.APP_URL}/dashboard.html"
             style="background:#B8860B;color:#000;padding:12px 24px;
             border-radius:6px;text-decoration:none;font-weight:bold;">
            View on TAP</a>
          <p style="color:#444;font-size:0.75rem;margin-top:24px;">
            Copyright 2026 BOLAJI B ADEEKO LLC. All Rights Reserved.</p>
        </div>`;
      await sendEmail(recipientEmail, subject, html);
    } catch (err) {
      console.error('Notification email error:', err.message);
    }
  }
}

// ── TAP ID generator ──────────────────────────────────────────────
async function generateTapId(role) {
  const year   = new Date().getFullYear();
  const prefix = {
    'Artist':           'TAP-ART',
    'Manager':          'TAP-MGR',
    'Producer':         'TAP-PRO',
    'Engineer':         'TAP-ENG',
    'Record Label':     'TAP-LBL',
    'Painter':          'TAP-CRE',
    'Filmmaker':        'TAP-CRE',
    'Fashion Designer': 'TAP-CRE',
    'Dancer':           'TAP-CRE',
    'Photographer':     'TAP-CRE',
    'Graphic Designer': 'TAP-CRE',
    'Videographer':     'TAP-CRE',
    'Actor':            'TAP-CRE',
    'Stylist':          'TAP-CRE',
    'Other':            'TAP-CRE'
  }[role] || 'TAP-USR';
  const result = await pool.query('SELECT COUNT(*) AS total FROM artist_logins');
  const num    = String(parseInt(result.rows[0].total) + 1).padStart(5, '0');
  return `${prefix}-${year}-${num}`;
}

// ════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════════

// Register — instant account creation (no approval gate)
app.post('/api/register', async (req, res) => {
  const {
    artistName, email, password, phone, city, state, country,
    role, instagram, tiktok, spotify, apple, youtube,
    website, portfolio, bio, tapIdLink
  } = req.body;
  if (!artistName || !email || !password)
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  try {
    // Check both logins and staging for duplicate email
    const existing = await pool.query(
      'SELECT 1 FROM artist_logins WHERE artist_email = $1',
      [email]
    );
    if (existing.rows.length > 0)
      return res.status(409).json({ message: 'An account with this email already exists.' });

    const assignedRole = role || 'Artist';
    const hash         = await bcrypt.hash(password, 12);
    const tapId        = await generateTapId(assignedRole);

    // Insert into artists table
    const artistInsert = await pool.query(
      `INSERT INTO artists
        (artist_name, artist_email, artist_phone, artist_city, artist_state, artist_country,
         instagram_url, tiktok_url, spotify_url, apple_url, youtube_url,
         website_url, portfolio_url, bio, tap_id, tap_id_link, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING artist_id`,
      [
        artistName, email,
        phone     || null, city      || null, state     || null, country   || null,
        instagram || null, tiktok    || null, spotify   || null, apple     || null, youtube   || null,
        website   || null, portfolio || null, bio       || null,
        tapId, tapIdLink || null, assignedRole
      ]
    );
    const newArtistId = artistInsert.rows[0].artist_id;

    // Insert into artist_logins table
    await pool.query(
      `INSERT INTO artist_logins
        (artist_name, artist_email, password_hash, artist_id, role, tap_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [artistName, email, hash, newArtistId, assignedRole, tapId]
    );

    // Send welcome email
    await sendEmail(email, 'Welcome to Tha Artist Portal!', `
      <div style="font-family:Arial;max-width:500px;margin:0 auto;
        background:#111;color:#eee;padding:32px;border-radius:12px;">
        <h1 style="color:#D4AF37;">Tha Artist Portal</h1>
        <p style="color:#888;margin-bottom:24px;">Your data. Your leverage.</p>
        <p>Welcome, ${artistName}! Your account is ready.</p>
        <p style="color:#D4AF37;font-size:1.1rem;font-weight:bold;margin:16px 0;">
          Your TAP ID: ${tapId}
        </p>
        <p style="color:#aaa;">Log in now and start building your network.</p>
        <a href="${process.env.APP_URL}"
           style="display:inline-block;background:#B8860B;color:#000;
           padding:12px 24px;border-radius:6px;text-decoration:none;
           font-weight:bold;margin-top:16px;">
          Log In to TAP</a>
        <p style="color:#444;font-size:0.75rem;margin-top:24px;">
          Copyright 2026 BOLAJI B ADEEKO LLC. All Rights Reserved.</p>
      </div>`);

    res.json({
      message: 'Account created! Welcome to Tha Artist Portal.',
      tapId
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed.', error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required.' });
  try {
    const result = await pool.query(
      `SELECT login_id, artist_name, artist_email, password_hash, role, tap_id, artist_id
       FROM artist_logins WHERE artist_email = $1`,
      [email]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ message: 'Invalid email or password.' });

    const user  = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ message: 'Invalid email or password.' });

    const token = jwt.sign(
      {
        loginId:  user.login_id,
        artistId: user.artist_id,
        name:     user.artist_name,
        email:    user.artist_email,
        role:     user.role,
        tapId:    user.tap_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({
      token,
      name:  user.artist_name,
      role:  user.role,
      tapId: user.tap_id
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION ROUTES
// ════════════════════════════════════════════════════════════════

// GET VAPID public key
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST save push subscription
app.post('/api/push/subscribe', authMiddleware, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys)
    return res.status(400).json({ message: 'Invalid subscription.' });
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (login_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint)
       DO UPDATE SET login_id = $1, p256dh = $3, auth = $4`,
      [req.artist.loginId, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ message: 'Push subscription saved.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save subscription.', error: err.message });
  }
});

// DELETE remove push subscription
app.delete('/api/push/subscribe', authMiddleware, async (req, res) => {
  const { endpoint } = req.body;
  try {
    await pool.query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND login_id = $2',
      [endpoint, req.artist.loginId]
    );
    res.json({ message: 'Unsubscribed.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to unsubscribe.', error: err.message });
  }
});

// POST test push notification
app.post('/api/push/test', authMiddleware, async (req, res) => {
  try {
    await sendPushToUser(
      req.artist.loginId,
      'TAP Notification Test 🎵',
      'Push notifications are working! You will now receive alerts for messages and collab requests.',
      '/dashboard.html'
    );
    res.json({ message: 'Test notification sent!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send test.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// PROFILE ROUTES
// ════════════════════════════════════════════════════════════════

// GET artist profile
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM artists WHERE artist_id = $1',
      [req.artist.artistId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Profile not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error loading profile.', error: err.message });
  }
});

// PUT update artist profile
app.put('/api/profile', authMiddleware, async (req, res) => {
  const {
    artistName, email, phone, city, state, genre,
    instagram, tiktok, spotify, apple, youtube,
    subField, website, portfolio, daw, bio
  } = req.body;
  try {
    const setClauses = [];
    const params     = [];

    const add = (col, val) => {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        params.push(String(val).trim());
        setClauses.push(`${col} = $${params.length}`);
      }
    };

    add('artist_name',      artistName);
    add('artist_email',     email);
    add('artist_phone',     phone);
    add('artist_city',      city);
    add('artist_state',     state);
    add('genre_specialty',  genre);
    add('instagram_url',    instagram);
    add('tiktok_url',       tiktok);
    add('spotify_url',      spotify);
    add('apple_url',        apple);
    add('youtube_url',      youtube);
    add('creative_subfield',subField);
    add('website_url',      website);
    add('portfolio_url',    portfolio);
    add('daw_software',     daw);
    add('bio',              bio);

    if (setClauses.length === 0)
      return res.status(400).json({ message: 'No changes provided.' });

    params.push(req.artist.artistId);
    await pool.query(
      `UPDATE artists SET ${setClauses.join(', ')} WHERE artist_id = $${params.length}`,
      params
    );

    // Sync name/email to artist_logins if changed
    const loginClauses = [];
    const loginParams  = [];
    if (artistName && String(artistName).trim()) {
      loginParams.push(String(artistName).trim());
      loginClauses.push(`artist_name = $${loginParams.length}`);
    }
    if (email && String(email).trim()) {
      loginParams.push(String(email).trim());
      loginClauses.push(`artist_email = $${loginParams.length}`);
    }
    if (loginClauses.length > 0) {
      loginParams.push(req.artist.artistId);
      await pool.query(
        `UPDATE artist_logins SET ${loginClauses.join(', ')} WHERE artist_id = $${loginParams.length}`,
        loginParams
      );
    }

    res.json({ message: 'Profile updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Update failed.', error: err.message });
  }
});

// GET social links
app.get('/api/social', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT instagram_url, tiktok_url, spotify_url, apple_url, youtube_url
       FROM artists WHERE artist_id = $1`,
      [req.artist.artistId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Artist not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error loading social links.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// SONG ROUTES
// ════════════════════════════════════════════════════════════════

// GET all songs for logged-in artist
app.get('/api/songs', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM songs WHERE artist_id = $1 ORDER BY created_at DESC',
      [req.artist.artistId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/songs', authMiddleware, async (req, res) => {
  const { songName, album, releaseDate, duration, isrc,
          featuredArtist, writersCredit, producerName } = req.body;
  if (!songName)
    return res.status(400).json({ message: 'Song name is required.' });
  try {
    await pool.query(
      `INSERT INTO songs
        (artist_id, song_name, album, release_date, duration_of_song,
         isrc, featured_artist, writers_credit, producer_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        req.artist.artistId, songName,
        album          || null, releaseDate    || null, duration       || null,
        isrc           || null, featuredArtist || null, writersCredit  || null, producerName   || null
      ]
    );
    res.json({ message: 'Song added successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error adding song.', error: err.message });
  }
});

app.put('/api/songs/:id', authMiddleware, async (req, res) => {
  const { songName, album, releaseDate, duration, isrc,
          featuredArtist, writersCredit, producerName } = req.body;
  try {
    await pool.query(
      `UPDATE songs SET
        song_name        = $1,
        album            = $2,
        release_date     = $3,
        duration_of_song = $4,
        isrc             = $5,
        featured_artist  = $6,
        writers_credit   = $7,
        producer_name    = $8
       WHERE song_id = $9 AND artist_id = $10`,
      [
        songName,
        album          || null, releaseDate    || null, duration       || null,
        isrc           || null, featuredArtist || null, writersCredit  || null, producerName   || null,
        req.params.id, req.artist.artistId
      ]
    );
    res.json({ message: 'Song updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating song.', error: err.message });
  }
});

app.delete('/api/songs/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM songs WHERE song_id = $1 AND artist_id = $2',
      [req.params.id, req.artist.artistId]
    );
    res.json({ message: 'Song deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting song.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// DASHBOARD DATA ROUTES
// ════════════════════════════════════════════════════════════════

// GET streams for logged-in artist
app.get('/api/streams', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM streams WHERE artist_id = $1 ORDER BY date_recorded DESC',
      [req.artist.artistId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// GET royalties for logged-in artist
app.get('/api/royalties', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM royalties WHERE artist_id = $1 ORDER BY payment_date DESC',
      [req.artist.artistId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// GET contracts for logged-in artist
app.get('/api/contracts', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM contracts WHERE artist_id = $1 ORDER BY contract_start_date DESC',
      [req.artist.artistId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// DISCOVER ROUTES
// ════════════════════════════════════════════════════════════════

app.get('/api/discover', authMiddleware, async (req, res) => {
  const { name, role, city, state, platform } = req.query;
  try {
    const params = [req.artist.loginId];
    const where  = ['l.login_id != $1'];

    if (name) {
      params.push('%' + name + '%');
      where.push(`l.artist_name ILIKE $${params.length}`);
    }
    if (role && role !== 'All') {
      params.push(role);
      where.push(`l.role = $${params.length}`);
    }
    if (city) {
      params.push('%' + city + '%');
      where.push(`a.artist_city ILIKE $${params.length}`);
    }
    if (state) {
      params.push('%' + state + '%');
      where.push(`a.artist_state ILIKE $${params.length}`);
    }
    if (platform === 'Spotify')     where.push('a.spotify_url IS NOT NULL');
    if (platform === 'Instagram')   where.push('a.instagram_url IS NOT NULL');
    if (platform === 'TikTok')      where.push('a.tiktok_url IS NOT NULL');
    if (platform === 'YouTube')     where.push('a.youtube_url IS NOT NULL');
    if (platform === 'Apple Music') where.push('a.apple_url IS NOT NULL');

    const result = await pool.query(
      `SELECT
        l.login_id, l.artist_name, l.role, l.tap_id,
        a.artist_city, a.artist_state, a.artist_country,
        a.instagram_url, a.tiktok_url, a.spotify_url, a.apple_url, a.youtube_url
       FROM artist_logins l
       LEFT JOIN artists a ON l.artist_id = a.artist_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.artist_name ASC
       LIMIT 50`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Search failed.', error: err.message });
  }
});

app.get('/api/discover/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        l.login_id, l.artist_name, l.role, l.tap_id, l.created_date,
        a.artist_city, a.artist_state, a.artist_country,
        a.instagram_url, a.tiktok_url, a.spotify_url, a.apple_url, a.youtube_url,
        a.signed_2_label, a.manager_name, a.ascap_id, a.bio,
        a.genre_specialty, a.website_url, a.portfolio_url
       FROM artist_logins l
       LEFT JOIN artists a ON l.artist_id = a.artist_id
       WHERE l.login_id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Profile not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error loading profile.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// COLLAB REQUEST ROUTES
// ════════════════════════════════════════════════════════════════

app.post('/api/collab-request', authMiddleware, async (req, res) => {
  const { receiverLoginId, message } = req.body;
  if (!receiverLoginId)
    return res.status(400).json({ message: 'Receiver is required.' });
  if (parseInt(receiverLoginId) === req.artist.loginId)
    return res.status(400).json({ message: 'You cannot send a request to yourself.' });
  try {
    const existing = await pool.query(
      `SELECT 1 FROM collab_requests
       WHERE sender_login_id = $1 AND receiver_login_id = $2 AND status = 'Pending'`,
      [req.artist.loginId, receiverLoginId]
    );
    if (existing.rows.length > 0)
      return res.status(409).json({ message: 'You already sent a request to this person.' });

    const receiver = await pool.query(
      'SELECT artist_name, tap_id, role, artist_email FROM artist_logins WHERE login_id = $1',
      [receiverLoginId]
    );
    if (receiver.rows.length === 0)
      return res.status(404).json({ message: 'User not found.' });
    const rec = receiver.rows[0];

    await pool.query(
      `INSERT INTO collab_requests
        (sender_login_id, sender_name, sender_tap_id, sender_role, sender_email,
         receiver_login_id, receiver_name, receiver_tap_id, receiver_role, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        req.artist.loginId, req.artist.name, req.artist.tapId || null,
        req.artist.role || null, req.artist.email || null,
        receiverLoginId, rec.artist_name, rec.tap_id || null,
        rec.role || null, message || null
      ]
    );

    await createNotification(
      receiverLoginId, req.artist.loginId, req.artist.name,
      'collab_request',
      req.artist.name + ' sent you a collab request: ' + (message || ''),
      '/dashboard.html',
      rec.artist_email
    );

    res.json({ message: 'Collab request sent to ' + rec.artist_name + '!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send request.', error: err.message });
  }
});

app.get('/api/collab-requests', authMiddleware, async (req, res) => {
  try {
    const sent = await pool.query(
      'SELECT * FROM collab_requests WHERE sender_login_id = $1 ORDER BY sent_at DESC',
      [req.artist.loginId]
    );
    const received = await pool.query(
      'SELECT * FROM collab_requests WHERE receiver_login_id = $1 ORDER BY sent_at DESC',
      [req.artist.loginId]
    );
    res.json({ sent: sent.rows, received: received.rows });
  } catch (err) {
    res.status(500).json({ message: 'Error loading requests.', error: err.message });
  }
});

app.put('/api/collab-request/:id', authMiddleware, async (req, res) => {
  const { status } = req.body;
  if (!['Accepted', 'Declined'].includes(status))
    return res.status(400).json({ message: 'Status must be Accepted or Declined.' });
  try {
    const reqData = await pool.query(
      `SELECT cr.*, l.artist_email AS sender_email_addr
       FROM collab_requests cr
       LEFT JOIN artist_logins l ON l.login_id = cr.sender_login_id
       WHERE cr.request_id = $1 AND cr.receiver_login_id = $2`,
      [req.params.id, req.artist.loginId]
    );
    if (reqData.rows.length === 0)
      return res.status(404).json({ message: 'Request not found.' });
    const cr = reqData.rows[0];

    await pool.query(
      `UPDATE collab_requests
       SET status = $1, responded_at = NOW()
       WHERE request_id = $2 AND receiver_login_id = $3`,
      [status, req.params.id, req.artist.loginId]
    );

    const notifType = status === 'Accepted' ? 'collab_accepted' : 'collab_declined';
    const notifMsg  = status === 'Accepted'
      ? req.artist.name + ' accepted your collab request!'
      : req.artist.name + ' declined your collab request.';

    await createNotification(
      cr.sender_login_id, req.artist.loginId, req.artist.name,
      notifType, notifMsg, '/dashboard.html', cr.sender_email_addr
    );

    res.json({ message: 'Request ' + status.toLowerCase() + '.' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating request.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// CONNECTIONS ROUTE
// ════════════════════════════════════════════════════════════════

app.get('/api/connections', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT
        cr.request_id,
        CASE WHEN cr.sender_login_id = $1
             THEN cr.receiver_login_id
             ELSE cr.sender_login_id END AS other_login_id,
        CASE WHEN cr.sender_login_id = $1
             THEN cr.receiver_name
             ELSE cr.sender_name END AS other_name,
        CASE WHEN cr.sender_login_id = $1
             THEN cr.receiver_role
             ELSE cr.sender_role END AS other_role,
        CASE WHEN cr.sender_login_id = $1
             THEN cr.receiver_tap_id
             ELSE cr.sender_tap_id END AS other_tap_id
       FROM collab_requests cr
       WHERE cr.status = 'Accepted'
       AND (cr.sender_login_id = $1 OR cr.receiver_login_id = $1)
       ORDER BY other_name ASC`,
      [req.artist.loginId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// NOTIFICATION ROUTES
// ════════════════════════════════════════════════════════════════

app.get('/api/notifications/count', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE recipient_id = $1 AND is_read = FALSE',
      [req.artist.loginId]
    );
    res.json({ unread: parseInt(result.rows[0].unread) });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.artist.loginId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.put('/api/notifications/read', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE recipient_id = $1 AND is_read = FALSE',
      [req.artist.loginId]
    );
    res.json({ message: 'Marked as read.' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/notifications/preferences', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notification_preferences WHERE login_id = $1',
      [req.artist.loginId]
    );
    res.json(result.rows[0] || {
      collab_requests: true, profile_views: true,
      new_messages: true,   new_followers: false,
      new_users_city: false, email_alerts: true, push_enabled: true
    });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.put('/api/notifications/preferences', authMiddleware, async (req, res) => {
  const {
    collabRequests, profileViews, newMessages,
    newFollowers, newUsersCity, emailAlerts, pushEnabled
  } = req.body;
  try {
    const existing = await pool.query(
      'SELECT 1 FROM notification_preferences WHERE login_id = $1',
      [req.artist.loginId]
    );

    const vals = [
      req.artist.loginId,
      !!collabRequests,
      !!profileViews,
      !!newMessages,
      !!newFollowers,
      !!newUsersCity,
      !!emailAlerts,
      pushEnabled !== false
    ];

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE notification_preferences SET
          collab_requests=$2, profile_views=$3, new_messages=$4,
          new_followers=$5, new_users_city=$6, email_alerts=$7, push_enabled=$8
         WHERE login_id=$1`,
        vals
      );
    } else {
      await pool.query(
        `INSERT INTO notification_preferences
          (login_id, collab_requests, profile_views, new_messages,
           new_followers, new_users_city, email_alerts, push_enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        vals
      );
    }
    res.json({ message: 'Preferences saved!' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// MESSAGE ROUTES
// ════════════════════════════════════════════════════════════════

app.get('/api/messages/conversations', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        conv.conversation_id,
        conv.other_id,
        l.artist_name AS other_name,
        conv.last_message_at,
        conv.unread_count
       FROM (
         SELECT
           conversation_id,
           CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_id,
           MAX(sent_at) AS last_message_at,
           SUM(CASE WHEN is_read = FALSE AND receiver_id = $1 THEN 1 ELSE 0 END) AS unread_count
         FROM messages
         WHERE sender_id = $1 OR receiver_id = $1
         GROUP BY conversation_id,
           CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END
       ) conv
       LEFT JOIN artist_logins l ON l.login_id = conv.other_id
       ORDER BY conv.last_message_at DESC`,
      [req.artist.loginId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/messages/:conversationId', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE messages SET is_read = TRUE WHERE conversation_id = $1 AND receiver_id = $2',
      [req.params.conversationId, req.artist.loginId]
    );
    const result = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at ASC',
      [req.params.conversationId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/messages', authMiddleware, async (req, res) => {
  const { receiverId, messageText } = req.body;
  if (!receiverId || !messageText)
    return res.status(400).json({ message: 'Receiver and message are required.' });
  try {
    const connected = await pool.query(
      `SELECT 1 FROM collab_requests
       WHERE status = 'Accepted'
       AND ((sender_login_id = $1 AND receiver_login_id = $2)
       OR   (sender_login_id = $2 AND receiver_login_id = $1))`,
      [req.artist.loginId, receiverId]
    );
    if (connected.rows.length === 0)
      return res.status(403).json({ message: 'You can only message accepted connections.' });

    const convId = [req.artist.loginId, parseInt(receiverId)].sort((a, b) => a - b).join('-');
    await pool.query(
      `INSERT INTO messages
        (conversation_id, sender_id, sender_name, receiver_id, message_text)
       VALUES ($1,$2,$3,$4,$5)`,
      [convId, req.artist.loginId, req.artist.name, receiverId, messageText]
    );

    const receiverInfo = await pool.query(
      'SELECT artist_email FROM artist_logins WHERE login_id = $1',
      [receiverId]
    );
    const receiverEmail = receiverInfo.rows[0]?.artist_email;

    await createNotification(
      receiverId, req.artist.loginId, req.artist.name,
      'new_message',
      req.artist.name + ' sent you a message',
      '/dashboard.html',
      receiverEmail
    );

    res.json({ message: 'Message sent!', conversationId: convId });
  } catch (err) { res.status(500).json({ message: 'Error sending message.', error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════

function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== process.env.JWT_SECRET)
    return res.status(403).json({ message: 'Not authorized.' });
  next();
}

app.get('/api/admin/pending', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM artist_registration_staging WHERE status = 'Pending' ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/approve/:id', adminAuth, async (req, res) => {
  try {
    const staging = await pool.query(
      "SELECT * FROM artist_registration_staging WHERE staging_id = $1 AND status = 'Pending'",
      [req.params.id]
    );
    if (staging.rows.length === 0)
      return res.status(404).json({ message: 'Pending registration not found.' });

    const rec   = staging.rows[0];
    const role  = rec.role || 'Artist';
    const tapId = await generateTapId(role);

    const artistInsert = await pool.query(
      `INSERT INTO artists
        (artist_name, artist_email, artist_phone, artist_city, artist_state, artist_country,
         instagram_url, tiktok_url, spotify_url, apple_url, youtube_url,
         website_url, portfolio_url, bio, tap_id, tap_id_link, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING artist_id`,
      [
        rec.artist_name, rec.artist_email, rec.artist_phone || null,
        rec.artist_city || null, rec.artist_state || null, rec.artist_country || null,
        rec.instagram_url || null, rec.tiktok_url || null, rec.spotify_url || null,
        rec.apple_url || null, rec.youtube_url || null,
        rec.website_url || null, rec.portfolio_url || null, rec.bio || null,
        tapId, rec.tap_id_link || null, role
      ]
    );
    const newArtistId = artistInsert.rows[0].artist_id;

    await pool.query(
      `INSERT INTO artist_logins
        (artist_name, artist_email, password_hash, artist_id, role, tap_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [rec.artist_name, rec.artist_email, rec.password_hash, newArtistId, role, tapId]
    );

    await pool.query(
      "UPDATE artist_registration_staging SET status = 'Approved' WHERE staging_id = $1",
      [req.params.id]
    );

    await sendEmail(rec.artist_email, "Welcome to Tha Artist Portal — You're Approved!", `
      <div style="font-family:Arial;max-width:500px;margin:0 auto;
        background:#111;color:#eee;padding:32px;border-radius:12px;">
        <h1 style="color:#D4AF37;">Tha Artist Portal</h1>
        <p>Welcome, ${rec.artist_name}! Your account has been approved.</p>
        <p style="color:#D4AF37;font-size:1.1rem;font-weight:bold;">Your TAP ID: ${tapId}</p>
        <p>Log in and start building your network.</p>
        <a href="${process.env.APP_URL}"
           style="background:#B8860B;color:#000;padding:12px 24px;
           border-radius:6px;text-decoration:none;font-weight:bold;">
          Log In to TAP</a>
        <p style="color:#444;font-size:0.75rem;margin-top:24px;">
          Copyright 2026 BOLAJI B ADEEKO LLC.</p>
      </div>`);

    res.json({ message: 'Approved! TAP ID: ' + tapId });
  } catch (err) {
    res.status(500).json({ message: 'Approval failed.', error: err.message });
  }
});

app.post('/api/admin/reject/:id', adminAuth, async (req, res) => {
  const { reason } = req.body;
  try {
    await pool.query(
      "UPDATE artist_registration_staging SET status = 'Rejected', reject_reason = $1 WHERE staging_id = $2",
      [reason || 'No reason given', req.params.id]
    );
    res.json({ message: 'Registration rejected.' });
  } catch (err) { res.status(500).json({ message: 'Rejection failed.', error: err.message }); }
});

app.get('/api/admin/artists', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT artist_id, artist_name FROM artists ORDER BY artist_name ASC'
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/admin/all-users', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        l.login_id, l.artist_name, l.artist_email,
        l.role, l.tap_id, l.artist_id, l.created_date,
        a.artist_city, a.artist_state,
        a.instagram_url, a.tiktok_url, a.spotify_url, a.apple_url, a.youtube_url,
        a.genre_specialty, a.creative_field,
        a.studio_name, a.label_name, a.daw_software, a.years_experience
       FROM artist_logins l
       LEFT JOIN artists a ON l.artist_id = a.artist_id
       ORDER BY l.role, l.artist_name`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/admin/collab-requests', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM collab_requests ORDER BY sent_at DESC'
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/admin/user-profile/:id', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM artists WHERE artist_id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/songs', adminAuth, async (req, res) => {
  const { artistId, songName, album, releaseDate, duration,
          isrc, featuredArtist, writersCredit, producerName } = req.body;
  try {
    await pool.query(
      `INSERT INTO songs
        (artist_id, song_name, album, release_date, duration_of_song,
         isrc, featured_artist, writers_credit, producer_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        artistId, songName,
        album          || null, releaseDate    || null, duration       || null,
        isrc           || null, featuredArtist || null, writersCredit  || null, producerName   || null
      ]
    );
    res.json({ message: 'Song added successfully!' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/streams', adminAuth, async (req, res) => {
  const { artistId, songId, platform, streamCount, dateRecorded } = req.body;
  try {
    await pool.query(
      `INSERT INTO streams
        (artist_id, song_id, streaming_platform, stream_count, date_recorded)
       VALUES ($1,$2,$3,$4,$5)`,
      [artistId, songId || null, platform, streamCount, dateRecorded || null]
    );
    res.json({ message: 'Stream data added!' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/royalties', adminAuth, async (req, res) => {
  const { artistId, platform, labelName, amount, paymentDate, status } = req.body;
  try {
    await pool.query(
      `INSERT INTO royalties
        (artist_id, streaming_platform, label_name, amount, payment_date, status_on_royaltiy)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [artistId, platform || null, labelName || null, amount, paymentDate || null, status || 'Pending']
    );
    res.json({ message: 'Royalty payment added!' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/contracts', adminAuth, async (req, res) => {
  const {
    artistId, labelName, dealType, artistPct, managerPct,
    labelPct, artistLawyer, managerLawyer, startDate, endDate
  } = req.body;
  try {
    await pool.query(
      `INSERT INTO contracts
        (artist_id, label_name, deal_type,
         ownership_percent_artist, ownership_percent_manager, ownership_percent_label,
         artist_lawyer, manager_lawyer, contract_start_date, contract_end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        artistId, labelName || null, dealType || null,
        artistPct || 0, managerPct || 0, labelPct || 0,
        artistLawyer || null, managerLawyer || null, startDate || null, endDate || null
      ]
    );
    res.json({ message: 'Contract added!' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/update-role-data', adminAuth, async (req, res) => {
  const {
    artistId, genre, ascapId, labelName, labelOwner,
    rosterSize, managerName, dawSoftware, engineerType,
    studioName, subField, yearsExp, bio, websiteUrl,
    portfolioUrl, spotify, apple, instagram, tiktok, youtube
  } = req.body;
  try {
    const setClauses = [];
    const params     = [];

    const add = (col, val) => {
      if (val !== null && val !== undefined && val !== '') {
        params.push(val);
        setClauses.push(`${col} = $${params.length}`);
      }
    };

    add('genre_specialty',   genre);
    add('ascap_id_2',        ascapId);
    add('label_name',        labelName);
    add('label_owner',       labelOwner);
    add('roster_size',       rosterSize  ? parseInt(rosterSize)  : null);
    add('manager_name',      managerName);
    add('daw_software',      dawSoftware);
    add('engineer_type',     engineerType);
    add('studio_name',       studioName);
    add('creative_subfield', subField);
    add('years_experience',  yearsExp    ? parseInt(yearsExp)    : null);
    add('bio',               bio);
    add('website_url',       websiteUrl);
    add('portfolio_url',     portfolioUrl);
    add('spotify_url',       spotify);
    add('apple_url',         apple);
    add('instagram_url',     instagram);
    add('tiktok_url',        tiktok);
    add('youtube_url',       youtube);

    if (setClauses.length === 0)
      return res.status(400).json({ message: 'Nothing to update.' });

    params.push(artistId);
    await pool.query(
      `UPDATE artists SET ${setClauses.join(', ')} WHERE artist_id = $${params.length}`,
      params
    );
    res.json({ message: 'Role data updated successfully!' });
  } catch (err) { res.status(500).json({ message: 'Update failed.', error: err.message }); }
});

app.post('/api/admin/cleanup', adminAuth, async (req, res) => {
  try {
    await runNightlyCleanup();
    res.json({ message: 'Data cleanup completed successfully!' });
  } catch (err) { res.status(500).json({ message: 'Cleanup failed.', error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// FORGOT / RESET PASSWORD
// ════════════════════════════════════════════════════════════════

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required.' });
  try {
    const result = await pool.query(
      'SELECT login_id, artist_name FROM artist_logins WHERE artist_email = $1',
      [email]
    );
    if (result.rows.length === 0)
      return res.json({ message: 'If that email is registered, a reset link is on its way.' });

    const user   = result.rows[0];
    const crypto = require('crypto');
    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO password_reset_tokens (login_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.login_id, token, expiry]
    );

    const resetUrl = process.env.APP_URL + '/reset-password.html?token=' + token;
    const html = `
      <div style="font-family:Arial;max-width:500px;margin:0 auto;
        background:#111;color:#eee;padding:32px;border-radius:12px;">
        <h1 style="color:#D4AF37;">Tha Artist Portal</h1>
        <p style="color:#888;">Your data. Your leverage.</p>
        <div style="background:#1a1a1a;border-left:4px solid #D4AF37;
          border-radius:8px;padding:20px;margin-bottom:24px;">
          <p style="color:#eee;margin:0 0 8px;">Hi ${user.artist_name},</p>
          <p style="color:#aaa;margin:0;">
            We received a request to reset your TAP password.
            Click below to set a new password. This link expires in 1 hour.
          </p>
        </div>
        <a href="${resetUrl}"
           style="display:inline-block;background:#B8860B;color:#000;
           padding:14px 28px;border-radius:8px;text-decoration:none;
           font-weight:bold;font-size:1rem;margin-bottom:24px;">
          Reset My Password
        </a>
        <p style="color:#555;font-size:0.8rem;">
          If you did not request this, ignore this email.
        </p>
        <p style="color:#444;font-size:0.75rem;margin-top:24px;">
          Copyright 2026 BOLAJI B ADEEKO LLC. All Rights Reserved.
        </p>
      </div>`;
    await sendEmail(email, 'Reset your TAP password', html);
    res.json({ message: 'If that email is registered, a reset link is on its way.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ message: 'Something went wrong. Try again.' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    return res.status(400).json({ message: 'Token and new password are required.' });
  if (newPassword.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  try {
    const result = await pool.query(
      'SELECT token_id, login_id, expires_at, used FROM password_reset_tokens WHERE token = $1',
      [token]
    );
    if (result.rows.length === 0)
      return res.status(400).json({ message: 'Invalid reset link. Please request a new one.' });

    const rec = result.rows[0];
    if (rec.used)
      return res.status(400).json({ message: 'This link has already been used. Please request a new one.' });
    if (new Date() > new Date(rec.expires_at))
      return res.status(400).json({ message: 'This link has expired. Please request a new one.' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE artist_logins SET password_hash = $1 WHERE login_id = $2',
      [hash, rec.login_id]
    );
    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE token_id = $1',
      [rec.token_id]
    );
    res.json({ message: 'Password reset successfully!' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ message: 'Something went wrong. Try again.' });
  }
});

// ════════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════════

connectWithRetry()
  .then(() => {
    startKeepAlive();
    startScheduler();
    app.listen(PORT, () => console.log(`TAP server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  });
