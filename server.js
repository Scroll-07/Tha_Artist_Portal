/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */

require('dotenv').config();

const express  = require('express');
const sql      = require('mssql');
const cors     = require('cors');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const webpush  = require('web-push');
const fetch = require('node-fetch');

const { getPool, startKeepAlive } = require('./db/connection');
const { startScheduler, runNightlyCleanup } = require('./scheduler/jobs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Resend setup ────────────────────────────────────────────────
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

// ── Push notification helper ─────────────────────────────────────
async function sendPushToUser(pool, loginId, title, body, url) {
  try {
    const result = await pool.request()
      .input('ID', sql.Int, loginId)
      .query('SELECT Endpoint, P256dh, Auth FROM Push_Subscriptions WHERE Login_ID = @ID');

    if (!result.recordset.length) return;

    const payload = JSON.stringify({ title, body, url: url || '/dashboard.html' });

    for (const sub of result.recordset) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.Endpoint, keys: { p256dh: sub.P256dh, auth: sub.Auth } },
          payload
        );
      } catch (err) {
        // Subscription expired — remove it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.request()
            .input('Endpoint', sql.NVarChar, sub.Endpoint)
            .query('DELETE FROM Push_Subscriptions WHERE Endpoint = @Endpoint');
          console.log('Removed expired push subscription');
        }
      }
    }
  } catch (err) {
    console.error('Push notification failed:', err.message);
  }
}

// ── Notification helper ───────────────────────────────────────────
async function createNotification(pool, recipientId, senderId, senderName,
                                   type, message, link, recipientEmail) {
  // Save in-app notification
  await pool.request()
    .input('RecipID',  sql.Int,      recipientId)
    .input('SendID',   sql.Int,      senderId   || null)
    .input('SendName', sql.NVarChar, senderName || null)
    .input('Type',     sql.NVarChar, type)
    .input('Msg',      sql.NVarChar, message    || null)
    .input('Link',     sql.NVarChar, link       || null)
    .query(`INSERT INTO Notifications
      (Recipient_ID, Sender_ID, Sender_Name, Type, Message, Link)
      VALUES (@RecipID, @SendID, @SendName, @Type, @Msg, @Link)`);

  // Get recipient notification preferences
  let prefs = null;
  try {
    const prefResult = await pool.request()
      .input('LoginID', sql.Int, recipientId)
      .query('SELECT * FROM Notification_Preferences WHERE Login_ID = @LoginID');
    prefs = prefResult.recordset[0];
  } catch (_) {}

  const emailEnabled = !prefs || prefs.Email_Alerts === 1;
  const pushEnabled  = !prefs || prefs.Push_Enabled !== 0;

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
      pool, recipientId,
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

// ── TAP ID generator ─────────────────────────────────────────────
async function generateTapId(role) {
  const pool   = await getPool();
  const year   = new Date().getFullYear();
  const prefix = {
    'Artist':          'TAP-ART',
    'Manager':         'TAP-MGR',
    'Producer':        'TAP-PRO',
    'Engineer':        'TAP-ENG',
    'Record Label':    'TAP-LBL',
    'Painter':         'TAP-CRE',
    'Filmmaker':       'TAP-CRE',
    'Fashion Designer':'TAP-CRE',
    'Dancer':          'TAP-CRE',
    'Photographer':    'TAP-CRE',
    'Graphic Designer':'TAP-CRE',
    'Videographer':    'TAP-CRE',
    'Actor':           'TAP-CRE',
    'Stylist':         'TAP-CRE',
    'Other':           'TAP-CRE'
  }[role] || 'TAP-USR';
  const result = await pool.request()
    .query('SELECT COUNT(*) AS Total FROM ArtistLogins');
  const num = String(result.recordset[0].Total + 1).padStart(5, '0');
  return `${prefix}-${year}-${num}`;
}

// ════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════════

// Register — stage for admin approval
app.post('/api/register', async (req, res) => {
  const { artistName, email, password, phone, city, state,
          role, instagram, tiktok, spotify, apple, youtube } = req.body;
  if (!artistName || !email || !password)
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  try {
    const pool = await getPool();
    const existing = await pool.request()
      .input('Email', sql.NVarChar, email)
      .query('SELECT 1 FROM ArtistLogins WHERE Artist_Email = @Email');
    if (existing.recordset.length > 0)
      return res.status(409).json({ message: 'An account with this email already exists.' });

    const hash = await bcrypt.hash(password, 12);
    await pool.request()
      .input('Name',      sql.NVarChar, artistName)
      .input('Email',     sql.NVarChar, email)
      .input('Hash',      sql.NVarChar, hash)
      .input('Phone',     sql.NVarChar, phone     || null)
      .input('City',      sql.NVarChar, city      || null)
      .input('State',     sql.NVarChar, state     || null)
      .input('Role',      sql.NVarChar, role      || 'Artist')
      .input('Instagram', sql.NVarChar, instagram || null)
      .input('TikTok',    sql.NVarChar, tiktok    || null)
      .input('Spotify',   sql.NVarChar, spotify   || null)
      .input('Apple',     sql.NVarChar, apple     || null)
      .input('YouTube',   sql.NVarChar, youtube   || null)
      .query(`INSERT INTO Artist_Registration_Staging
        (Artist_Name, Artist_Email, Password_Hash, Artist_Phone,
         Artist_City, Artist_State, Role,
         Instagram_URL, TikTok_URL, Spotify_URL, Apple_URL, YouTube_URL)
        VALUES
        (@Name, @Email, @Hash, @Phone, @City, @State, @Role,
         @Instagram, @TikTok, @Spotify, @Apple, @YouTube)`);
    res.json({ message: 'Registration submitted! You will be notified once approved.' });
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
    const pool   = await getPool();
    const result = await pool.request()
      .input('Email', sql.NVarChar, email)
      .query(`SELECT l.Login_ID, l.Artist_Name, l.Artist_Email,
                     l.Password_Hash, l.Role, l.TAP_ID, l.Artist_ID
              FROM ArtistLogins l
              WHERE l.Artist_Email = @Email`);
    if (result.recordset.length === 0)
      return res.status(401).json({ message: 'Invalid email or password.' });

    const user  = result.recordset[0];
    const match = await bcrypt.compare(password, user.Password_Hash);
    if (!match)
      return res.status(401).json({ message: 'Invalid email or password.' });

    const token = jwt.sign(
      { loginId:  user.Login_ID,
        artistId: user.Artist_ID,
        name:     user.Artist_Name,
        email:    user.Artist_Email,
        role:     user.Role,
        tapId:    user.TAP_ID },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({
      token,
      name:  user.Artist_Name,
      role:  user.Role,
      tapId: user.TAP_ID
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION ROUTES
// ════════════════════════════════════════════════════════════════

// GET VAPID public key — used by the frontend to subscribe
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST save push subscription from browser
app.post('/api/push/subscribe', authMiddleware, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys)
    return res.status(400).json({ message: 'Invalid subscription.' });
  try {
    const pool = await getPool();
    // Upsert — update if endpoint exists, insert if not
    const existing = await pool.request()
      .input('Endpoint', sql.NVarChar, endpoint)
      .query('SELECT 1 FROM Push_Subscriptions WHERE Endpoint = @Endpoint');
    if (existing.recordset.length > 0) {
      await pool.request()
        .input('ID',       sql.Int,      req.artist.loginId)
        .input('Endpoint', sql.NVarChar, endpoint)
        .input('P256dh',   sql.NVarChar, keys.p256dh)
        .input('Auth',     sql.NVarChar, keys.auth)
        .query(`UPDATE Push_Subscriptions
                SET Login_ID = @ID, P256dh = @P256dh, Auth = @Auth
                WHERE Endpoint = @Endpoint`);
    } else {
      await pool.request()
        .input('ID',       sql.Int,      req.artist.loginId)
        .input('Endpoint', sql.NVarChar, endpoint)
        .input('P256dh',   sql.NVarChar, keys.p256dh)
        .input('Auth',     sql.NVarChar, keys.auth)
        .query(`INSERT INTO Push_Subscriptions (Login_ID, Endpoint, P256dh, Auth)
                VALUES (@ID, @Endpoint, @P256dh, @Auth)`);
    }
    res.json({ message: 'Push subscription saved.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save subscription.', error: err.message });
  }
});

// DELETE remove push subscription (when user turns off notifications)
app.delete('/api/push/subscribe', authMiddleware, async (req, res) => {
  const { endpoint } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('Endpoint', sql.NVarChar, endpoint)
      .input('ID',       sql.Int,      req.artist.loginId)
      .query('DELETE FROM Push_Subscriptions WHERE Endpoint = @Endpoint AND Login_ID = @ID');
    res.json({ message: 'Unsubscribed.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to unsubscribe.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// PROFILE ROUTES
// ════════════════════════════════════════════════════════════════

// GET artist profile
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ArtistID', sql.Int, req.artist.artistId)
      .query('SELECT * FROM Artists WHERE Artist_ID = @ArtistID');
    if (result.recordset.length === 0)
      return res.status(404).json({ message: 'Profile not found.' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error loading profile.', error: err.message });
  }
});

// PUT update artist profile — handles ALL fields including extended ones
app.put('/api/profile', authMiddleware, async (req, res) => {
  const {
    artistName, email, phone, city, state, genre,
    instagram, tiktok, spotify, apple, youtube,
    subField, website, portfolio, daw, bio
  } = req.body;
  try {
    const pool    = await getPool();
    const updates = [];
    const inputs  = [];

    const add = (col, param, type, val) => {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        updates.push(`${col} = @${param}`);
        inputs.push({ name: param, type, value: String(val).trim() });
      }
    };

    add('Artist_Name',          'Name',      sql.NVarChar, artistName);
    add('Artist_Email',         'Email',     sql.NVarChar, email);
    add('Artist_Phone_Number',  'Phone',     sql.NVarChar, phone);
    add('Artist_City',          'City',      sql.NVarChar, city);
    add('Artist_State',         'State',     sql.NVarChar, state);
    add('Genre_Specialty',      'Genre',     sql.NVarChar, genre);
    add('Artist_Instagram_URL', 'Instagram', sql.NVarChar, instagram);
    add('Artist_TikTok_URL',    'TikTok',    sql.NVarChar, tiktok);
    add('Artist_Spotify_URL',   'Spotify',   sql.NVarChar, spotify);
    add('Artist_Apple_URL',     'Apple',     sql.NVarChar, apple);
    add('Artist_Youtube_URL',   'YouTube',   sql.NVarChar, youtube);
    add('Creative_SubField',    'SubField',  sql.NVarChar, subField);
    add('Website_URL',          'Website',   sql.NVarChar, website);
    add('Portfolio_URL',        'Portfolio', sql.NVarChar, portfolio);
    add('DAW_Software',         'DAW',       sql.NVarChar, daw);
    add('Bio',                  'Bio',       sql.NVarChar, bio);

    if (updates.length === 0)
      return res.status(400).json({ message: 'No changes provided.' });

    const request = pool.request().input('ArtistID', sql.Int, req.artist.artistId);
    inputs.forEach(i => request.input(i.name, i.type, i.value));
    await request.query(`UPDATE Artists SET ${updates.join(', ')} WHERE Artist_ID = @ArtistID`);

    // Sync name/email to ArtistLogins if changed
    const loginUpdates  = [];
    const loginInputs   = [];
    const loginRequest  = pool.request().input('ArtistID', sql.Int, req.artist.artistId);
    if (artistName && String(artistName).trim()) {
      loginUpdates.push('Artist_Name = @Name');
      loginRequest.input('Name', sql.NVarChar, String(artistName).trim());
    }
    if (email && String(email).trim()) {
      loginUpdates.push('Artist_Email = @Email');
      loginRequest.input('Email', sql.NVarChar, String(email).trim());
    }
    if (loginUpdates.length > 0) {
      await loginRequest.query(
        `UPDATE ArtistLogins SET ${loginUpdates.join(', ')} WHERE Artist_ID = @ArtistID`
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
    const pool   = await getPool();
    const result = await pool.request()
      .input('ArtistID', sql.Int, req.artist.artistId)
      .query(`SELECT Artist_Instagram_URL, Artist_TikTok_URL,
                     Artist_Spotify_URL, Artist_Apple_URL, Artist_Youtube_URL
              FROM Artists WHERE Artist_ID = @ArtistID`);
    if (result.recordset.length === 0)
      return res.status(404).json({ message: 'Artist not found.' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error loading social links.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// SONG ROUTES
// ════════════════════════════════════════════════════════════════

app.post('/api/songs', authMiddleware, async (req, res) => {
  const { songName, album, releaseDate, duration, isrc,
          featuredArtist, writersCredit, producerName } = req.body;
  if (!songName)
    return res.status(400).json({ message: 'Song name is required.' });
  try {
    const pool = await getPool();
    await pool.request()
      .input('ArtistID',  sql.Int,      req.artist.artistId)
      .input('SongName',  sql.NVarChar, songName)
      .input('Album',     sql.NVarChar, album          || null)
      .input('Release',   sql.Date,     releaseDate    || null)
      .input('Duration',  sql.NVarChar, duration       || null)
      .input('ISRC',      sql.NVarChar, isrc           || null)
      .input('Featured',  sql.NVarChar, featuredArtist || null)
      .input('Writers',   sql.NVarChar, writersCredit  || null)
      .input('Producer',  sql.NVarChar, producerName   || null)
      .query(`INSERT INTO Songs
        (Artist_ID, Song_Name, Album, Release_Date, Duration_of_Song,
         ISRC, Featured_Artist, Writers_Credit, Producer_Name)
        VALUES
        (@ArtistID, @SongName, @Album, @Release, @Duration,
         @ISRC, @Featured, @Writers, @Producer)`);
    res.json({ message: 'Song added successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error adding song.', error: err.message });
  }
});

app.put('/api/songs/:id', authMiddleware, async (req, res) => {
  const { songName, album, releaseDate, duration, isrc,
          featuredArtist, writersCredit, producerName } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('SongID',   sql.Int,      req.params.id)
      .input('ArtistID', sql.Int,      req.artist.artistId)
      .input('SongName', sql.NVarChar, songName)
      .input('Album',    sql.NVarChar, album          || null)
      .input('Release',  sql.Date,     releaseDate    || null)
      .input('Duration', sql.NVarChar, duration       || null)
      .input('ISRC',     sql.NVarChar, isrc           || null)
      .input('Featured', sql.NVarChar, featuredArtist || null)
      .input('Writers',  sql.NVarChar, writersCredit  || null)
      .input('Producer', sql.NVarChar, producerName   || null)
      .query(`UPDATE Songs SET
        Song_Name        = @SongName,
        Album            = @Album,
        Release_Date     = @Release,
        Duration_of_Song = @Duration,
        ISRC             = @ISRC,
        Featured_Artist  = @Featured,
        Writers_Credit   = @Writers,
        Producer_Name    = @Producer
        WHERE Song_ID    = @SongID
        AND   Artist_ID  = @ArtistID`);
    res.json({ message: 'Song updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating song.', error: err.message });
  }
});

app.delete('/api/songs/:id', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('SongID',   sql.Int, req.params.id)
      .input('ArtistID', sql.Int, req.artist.artistId)
      .query('DELETE FROM Songs WHERE Song_ID = @SongID AND Artist_ID = @ArtistID');
    res.json({ message: 'Song deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting song.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// DISCOVER ROUTES
// ════════════════════════════════════════════════════════════════

app.get('/api/discover', authMiddleware, async (req, res) => {
  const { name, role, city, state, platform } = req.query;
  try {
    const pool    = await getPool();
    const request = pool.request();
    const where   = ['l.Login_ID != @MyID'];
    request.input('MyID', sql.Int, req.artist.loginId);

    if (name) {
      where.push('l.Artist_Name LIKE @Name');
      request.input('Name', sql.NVarChar, '%' + name + '%');
    }
    if (role && role !== 'All') {
      where.push('l.Role = @Role');
      request.input('Role', sql.NVarChar, role);
    }
    if (city) {
      where.push('a.Artist_City LIKE @City');
      request.input('City', sql.NVarChar, '%' + city + '%');
    }
    if (state) {
      where.push('a.Artist_State LIKE @State');
      request.input('State', sql.NVarChar, '%' + state + '%');
    }
    if (platform === 'Spotify')     where.push('a.Artist_Spotify_URL IS NOT NULL');
    if (platform === 'Instagram')   where.push('a.Artist_Instagram_URL IS NOT NULL');
    if (platform === 'TikTok')      where.push('a.Artist_TikTok_URL IS NOT NULL');
    if (platform === 'YouTube')     where.push('a.Artist_Youtube_URL IS NOT NULL');
    if (platform === 'Apple Music') where.push('a.Artist_Apple_URL IS NOT NULL');

    const result = await request.query(`
      SELECT TOP 50
        l.Login_ID, l.Artist_Name, l.Role, l.TAP_ID,
        a.Artist_City, a.Artist_State, a.Artist_Country,
        a.Artist_Instagram_URL, a.Artist_TikTok_URL,
        a.Artist_Spotify_URL, a.Artist_Apple_URL, a.Artist_Youtube_URL
      FROM ArtistLogins l
      LEFT JOIN Artists a ON l.Artist_ID = a.Artist_ID
      WHERE ${where.join(' AND ')}
      ORDER BY l.Artist_Name ASC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Search failed.', error: err.message });
  }
});

app.get('/api/discover/:id', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ID', sql.Int, req.params.id)
      .query(`SELECT
        l.Login_ID, l.Artist_Name, l.Role, l.TAP_ID, l.Created_Date,
        a.Artist_City, a.Artist_State, a.Artist_Country,
        a.Artist_Instagram_URL, a.Artist_TikTok_URL,
        a.Artist_Spotify_URL, a.Artist_Apple_URL, a.Artist_Youtube_URL,
        a.Signed_2_Label, a.Manager_Name, a.ASCAP_ID, a.Bio,
        a.Genre_Specialty, a.Website_URL, a.Portfolio_URL
      FROM ArtistLogins l
      LEFT JOIN Artists a ON l.Artist_ID = a.Artist_ID
      WHERE l.Login_ID = @ID`);
    if (result.recordset.length === 0)
      return res.status(404).json({ message: 'Profile not found.' });
    res.json(result.recordset[0]);
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
    const pool = await getPool();

    const existing = await pool.request()
      .input('SenderID',   sql.Int, req.artist.loginId)
      .input('ReceiverID', sql.Int, receiverLoginId)
      .query(`SELECT 1 FROM Collab_Requests
              WHERE Sender_Login_ID = @SenderID
              AND Receiver_Login_ID = @ReceiverID
              AND Status = 'Pending'`);
    if (existing.recordset.length > 0)
      return res.status(409).json({ message: 'You already sent a request to this person.' });

    const receiver = await pool.request()
      .input('ID', sql.Int, receiverLoginId)
      .query('SELECT Artist_Name, TAP_ID, Role, Artist_Email FROM ArtistLogins WHERE Login_ID = @ID');
    if (receiver.recordset.length === 0)
      return res.status(404).json({ message: 'User not found.' });
    const rec = receiver.recordset[0];

    await pool.request()
      .input('SenderID',    sql.Int,      req.artist.loginId)
      .input('SenderName',  sql.NVarChar, req.artist.name)
      .input('SenderTAP',   sql.NVarChar, req.artist.tapId  || null)
      .input('SenderRole',  sql.NVarChar, req.artist.role   || null)
      .input('SenderEmail', sql.NVarChar, req.artist.email  || null)
      .input('ReceiverID',  sql.Int,      receiverLoginId)
      .input('ReceiverName',sql.NVarChar, rec.Artist_Name)
      .input('ReceiverTAP', sql.NVarChar, rec.TAP_ID        || null)
      .input('ReceiverRole',sql.NVarChar, rec.Role          || null)
      .input('Message',     sql.NVarChar, message           || null)
      .query(`INSERT INTO Collab_Requests
        (Sender_Login_ID, Sender_Name, Sender_TAP_ID, Sender_Role, Sender_Email,
         Receiver_Login_ID, Receiver_Name, Receiver_TAP_ID, Receiver_Role, Message)
        VALUES
        (@SenderID, @SenderName, @SenderTAP, @SenderRole, @SenderEmail,
         @ReceiverID, @ReceiverName, @ReceiverTAP, @ReceiverRole, @Message)`);

    await createNotification(
      pool, receiverLoginId, req.artist.loginId, req.artist.name,
      'collab_request',
      req.artist.name + ' sent you a collab request: ' + (message || ''),
      '/dashboard.html',
      rec.Artist_Email
    );

    res.json({ message: 'Collab request sent to ' + rec.Artist_Name + '!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send request.', error: err.message });
  }
});

app.get('/api/collab-requests', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    const sent = await pool.request()
      .input('MyID', sql.Int, req.artist.loginId)
      .query('SELECT * FROM Collab_Requests WHERE Sender_Login_ID = @MyID ORDER BY Sent_At DESC');
    const received = await pool.request()
      .input('MyID2', sql.Int, req.artist.loginId)
      .query('SELECT * FROM Collab_Requests WHERE Receiver_Login_ID = @MyID2 ORDER BY Sent_At DESC');
    res.json({ sent: sent.recordset, received: received.recordset });
  } catch (err) {
    res.status(500).json({ message: 'Error loading requests.', error: err.message });
  }
});

app.put('/api/collab-request/:id', authMiddleware, async (req, res) => {
  const { status } = req.body;
  if (!['Accepted', 'Declined'].includes(status))
    return res.status(400).json({ message: 'Status must be Accepted or Declined.' });
  try {
    const pool = await getPool();

    // Get the request so we can notify the sender
    const reqData = await pool.request()
      .input('ID',   sql.Int, req.params.id)
      .input('MyID', sql.Int, req.artist.loginId)
      .query(`SELECT cr.*, l.Artist_Email AS Sender_Email_Addr
              FROM Collab_Requests cr
              LEFT JOIN ArtistLogins l ON l.Login_ID = cr.Sender_Login_ID
              WHERE cr.Request_ID = @ID
              AND cr.Receiver_Login_ID = @MyID`);

    if (reqData.recordset.length === 0)
      return res.status(404).json({ message: 'Request not found.' });

    const cr = reqData.recordset[0];

    await pool.request()
      .input('ID',     sql.Int,      req.params.id)
      .input('MyID',   sql.Int,      req.artist.loginId)
      .input('Status', sql.NVarChar, status)
      .query(`UPDATE Collab_Requests
              SET Status = @Status, Responded_At = GETDATE()
              WHERE Request_ID = @ID AND Receiver_Login_ID = @MyID`);

    // Notify the sender of the response
    const notifType = status === 'Accepted' ? 'collab_accepted' : 'collab_declined';
    const notifMsg  = status === 'Accepted'
      ? req.artist.name + ' accepted your collab request!'
      : req.artist.name + ' declined your collab request.';

    await createNotification(
      pool, cr.Sender_Login_ID, req.artist.loginId, req.artist.name,
      notifType, notifMsg, '/dashboard.html', cr.Sender_Email_Addr
    );

    res.json({ message: 'Request ' + status.toLowerCase() + '.' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating request.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// CONNECTIONS ROUTE (single definition — bug fix)
// ════════════════════════════════════════════════════════════════

app.get('/api/connections', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('MyID', sql.Int, req.artist.loginId)
      .query(`SELECT DISTINCT
        cr.Request_ID,
        CASE WHEN cr.Sender_Login_ID = @MyID
             THEN cr.Receiver_Login_ID
             ELSE cr.Sender_Login_ID END AS Other_Login_ID,
        CASE WHEN cr.Sender_Login_ID = @MyID
             THEN cr.Receiver_Name
             ELSE cr.Sender_Name END AS Other_Name,
        CASE WHEN cr.Sender_Login_ID = @MyID
             THEN cr.Receiver_Role
             ELSE cr.Sender_Role END AS Other_Role,
        CASE WHEN cr.Sender_Login_ID = @MyID
             THEN cr.Receiver_TAP_ID
             ELSE cr.Sender_TAP_ID END AS Other_TAP_ID
      FROM Collab_Requests cr
      WHERE cr.Status = 'Accepted'
      AND (cr.Sender_Login_ID = @MyID OR cr.Receiver_Login_ID = @MyID)
      ORDER BY Other_Name ASC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// NOTIFICATION ROUTES
// ════════════════════════════════════════════════════════════════

app.get('/api/notifications/count', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ID', sql.Int, req.artist.loginId)
      .query('SELECT COUNT(*) AS Unread FROM Notifications WHERE Recipient_ID = @ID AND Is_Read = 0');
    res.json({ unread: result.recordset[0].Unread });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ID', sql.Int, req.artist.loginId)
      .query('SELECT TOP 50 * FROM Notifications WHERE Recipient_ID = @ID ORDER BY Created_At DESC');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.put('/api/notifications/read', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('ID', sql.Int, req.artist.loginId)
      .query('UPDATE Notifications SET Is_Read = 1 WHERE Recipient_ID = @ID AND Is_Read = 0');
    res.json({ message: 'Marked as read.' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/notifications/preferences', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ID', sql.Int, req.artist.loginId)
      .query('SELECT * FROM Notification_Preferences WHERE Login_ID = @ID');
    res.json(result.recordset[0] || {
      Collab_Requests: 1, Profile_Views: 1,
      New_Messages: 1, New_Followers: 0,
      New_Users_City: 0, Email_Alerts: 1, Push_Enabled: 1
    });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.put('/api/notifications/preferences', authMiddleware, async (req, res) => {
  const { collabRequests, profileViews, newMessages,
          newFollowers, newUsersCity, emailAlerts, pushEnabled } = req.body;
  try {
    const pool     = await getPool();
    const existing = await pool.request()
      .input('ID', sql.Int, req.artist.loginId)
      .query('SELECT 1 FROM Notification_Preferences WHERE Login_ID = @ID');

    const vals = [
      { name: 'ID',        type: sql.Int, value: req.artist.loginId },
      { name: 'Collab',    type: sql.Bit, value: collabRequests ? 1 : 0 },
      { name: 'Profile',   type: sql.Bit, value: profileViews   ? 1 : 0 },
      { name: 'Messages',  type: sql.Bit, value: newMessages    ? 1 : 0 },
      { name: 'Followers', type: sql.Bit, value: newFollowers   ? 1 : 0 },
      { name: 'City',      type: sql.Bit, value: newUsersCity   ? 1 : 0 },
      { name: 'Email',     type: sql.Bit, value: emailAlerts    ? 1 : 0 },
      { name: 'Push',      type: sql.Bit, value: pushEnabled    !== false ? 1 : 0 }
    ];
    const req2 = pool.request();
    vals.forEach(v => req2.input(v.name, v.type, v.value));

    if (existing.recordset.length > 0) {
      await req2.query(`UPDATE Notification_Preferences SET
        Collab_Requests=@Collab, Profile_Views=@Profile,
        New_Messages=@Messages, New_Followers=@Followers,
        New_Users_City=@City, Email_Alerts=@Email, Push_Enabled=@Push
        WHERE Login_ID=@ID`);
    } else {
      await req2.query(`INSERT INTO Notification_Preferences
        (Login_ID, Collab_Requests, Profile_Views, New_Messages,
         New_Followers, New_Users_City, Email_Alerts, Push_Enabled)
        VALUES (@ID,@Collab,@Profile,@Messages,@Followers,@City,@Email,@Push)`);
    }
    res.json({ message: 'Preferences saved!' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// MESSAGE ROUTES
// ════════════════════════════════════════════════════════════════

app.get('/api/messages/conversations', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('MyID', sql.Int, req.artist.loginId)
      .query(`SELECT DISTINCT
        m.Conversation_ID,
        CASE WHEN m.Sender_ID = @MyID THEN m.Receiver_ID ELSE m.Sender_ID END AS Other_ID,
        CASE WHEN m.Sender_ID = @MyID THEN l2.Artist_Name ELSE m.Sender_Name END AS Other_Name,
        MAX(m.Sent_At) AS Last_Message_At,
        SUM(CASE WHEN m.Is_Read = 0 AND m.Receiver_ID = @MyID THEN 1 ELSE 0 END) AS Unread_Count
      FROM Messages m
      LEFT JOIN ArtistLogins l2 ON
        l2.Login_ID = CASE WHEN m.Sender_ID = @MyID THEN m.Receiver_ID ELSE m.Sender_ID END
      WHERE m.Sender_ID = @MyID OR m.Receiver_ID = @MyID
      GROUP BY m.Conversation_ID, m.Sender_ID, m.Receiver_ID, m.Sender_Name, l2.Artist_Name
      ORDER BY Last_Message_At DESC`);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/messages/:conversationId', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('ConvID', sql.NVarChar, req.params.conversationId)
      .input('MyID',   sql.Int,      req.artist.loginId)
      .query('UPDATE Messages SET Is_Read = 1 WHERE Conversation_ID = @ConvID AND Receiver_ID = @MyID');
    const result = await pool.request()
      .input('ConvID', sql.NVarChar, req.params.conversationId)
      .query('SELECT * FROM Messages WHERE Conversation_ID = @ConvID ORDER BY Sent_At ASC');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/messages', authMiddleware, async (req, res) => {
  const { receiverId, messageText } = req.body;
  if (!receiverId || !messageText)
    return res.status(400).json({ message: 'Receiver and message are required.' });
  try {
    const pool = await getPool();
    const connected = await pool.request()
      .input('S', sql.Int, req.artist.loginId)
      .input('R', sql.Int, receiverId)
      .query(`SELECT 1 FROM Collab_Requests
              WHERE Status = 'Accepted'
              AND ((Sender_Login_ID = @S AND Receiver_Login_ID = @R)
              OR   (Sender_Login_ID = @R AND Receiver_Login_ID = @S))`);
    if (connected.recordset.length === 0)
      return res.status(403).json({ message: 'You can only message accepted connections.' });

    const convId = [req.artist.loginId, parseInt(receiverId)].sort((a, b) => a - b).join('-');
    await pool.request()
      .input('ConvID',   sql.NVarChar, convId)
      .input('SenderID', sql.Int,      req.artist.loginId)
      .input('SenderNm', sql.NVarChar, req.artist.name)
      .input('RecvID',   sql.Int,      receiverId)
      .input('Text',     sql.NVarChar, messageText)
      .query(`INSERT INTO Messages
        (Conversation_ID, Sender_ID, Sender_Name, Receiver_ID, Message_Text)
        VALUES (@ConvID, @SenderID, @SenderNm, @RecvID, @Text)`);

    const receiverInfo = await pool.request()
      .input('RID', sql.Int, receiverId)
      .query('SELECT Artist_Email FROM ArtistLogins WHERE Login_ID = @RID');
    const receiverEmail = receiverInfo.recordset[0]?.Artist_Email;

    await createNotification(
      pool, receiverId, req.artist.loginId, req.artist.name,
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
    const pool   = await getPool();
    const result = await pool.request()
      .query("SELECT * FROM Artist_Registration_Staging WHERE Status = 'Pending' ORDER BY Created_At DESC");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/approve/:id', adminAuth, async (req, res) => {
  try {
    const pool    = await getPool();
    const staging = await pool.request()
      .input('ID', sql.Int, req.params.id)
      .query("SELECT * FROM Artist_Registration_Staging WHERE Staging_ID = @ID AND Status = 'Pending'");
    if (staging.recordset.length === 0)
      return res.status(404).json({ message: 'Pending registration not found.' });

    const rec   = staging.recordset[0];
    const role  = rec.Role || 'Artist';
    const tapId = await generateTapId(role);

    const artistInsert = await pool.request()
      .input('Name',      sql.NVarChar, rec.Artist_Name)
      .input('Email',     sql.NVarChar, rec.Artist_Email)
      .input('Phone',     sql.NVarChar, rec.Artist_Phone)
      .input('City',      sql.NVarChar, rec.Artist_City)
      .input('State',     sql.NVarChar, rec.Artist_State)
      .input('Instagram', sql.NVarChar, rec.Instagram_URL)
      .input('TikTok',    sql.NVarChar, rec.TikTok_URL)
      .input('Spotify',   sql.NVarChar, rec.Spotify_URL)
      .input('Apple',     sql.NVarChar, rec.Apple_URL)
      .input('YouTube',   sql.NVarChar, rec.YouTube_URL)
      .input('TapID',     sql.NVarChar, tapId)
      .query(`INSERT INTO Artists
        (Artist_Name, Artist_Email, Artist_Phone_Number,
         Artist_City, Artist_State,
         Artist_Instagram_URL, Artist_TikTok_URL,
         Artist_Spotify_URL, Artist_Apple_URL, Artist_Youtube_URL, TAP_ID)
        VALUES (@Name, @Email, @Phone, @City, @State,
         @Instagram, @TikTok, @Spotify, @Apple, @YouTube, @TapID);
        SELECT SCOPE_IDENTITY() AS Artist_ID;`);

    const newArtistId = artistInsert.recordset[0].Artist_ID;

    await pool.request()
      .input('Name',     sql.NVarChar, rec.Artist_Name)
      .input('Email',    sql.NVarChar, rec.Artist_Email)
      .input('Hash',     sql.NVarChar, rec.Password_Hash)
      .input('ArtistID', sql.Int,      newArtistId)
      .input('Role',     sql.NVarChar, role)
      .input('TapID',    sql.NVarChar, tapId)
      .query(`INSERT INTO ArtistLogins
        (Artist_Name, Artist_Email, Password_Hash, Artist_ID, Role, TAP_ID)
        VALUES (@Name, @Email, @Hash, @ArtistID, @Role, @TapID)`);

    await pool.request()
      .input('ID', sql.Int, req.params.id)
      .query("UPDATE Artist_Registration_Staging SET Status = 'Approved' WHERE Staging_ID = @ID");

    // Welcome email to new member
    await sendEmail(rec.Artist_Email, 'Welcome to Tha Artist Portal — You\'re Approved!', `
      <div style="font-family:Arial;max-width:500px;margin:0 auto;
        background:#111;color:#eee;padding:32px;border-radius:12px;">
        <h1 style="color:#D4AF37;">Tha Artist Portal</h1>
        <p>Welcome, ${rec.Artist_Name}! Your account has been approved.</p>
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
    const pool = await getPool();
    await pool.request()
      .input('ID',     sql.Int,      req.params.id)
      .input('Reason', sql.NVarChar, reason || 'No reason given')
      .query("UPDATE Artist_Registration_Staging SET Status = 'Rejected', Reject_Reason = @Reason WHERE Staging_ID = @ID");
    res.json({ message: 'Registration rejected.' });
  } catch (err) { res.status(500).json({ message: 'Rejection failed.', error: err.message }); }
});

app.get('/api/admin/artists', adminAuth, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query('SELECT Artist_ID, Artist_Name FROM Artists ORDER BY Artist_Name ASC');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// Single definition — bug fix (was duplicated)
app.get('/api/admin/all-users', adminAuth, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query(`SELECT
        l.Login_ID, l.Artist_Name, l.Artist_Email,
        l.Role, l.TAP_ID, l.Artist_ID, l.Created_Date,
        a.Artist_City, a.Artist_State,
        a.Artist_Instagram_URL, a.Artist_TikTok_URL,
        a.Artist_Spotify_URL, a.Artist_Apple_URL, a.Artist_Youtube_URL,
        a.Genre_Specialty, a.Creative_Field,
        a.Studio_Name, a.Label_Name, a.DAW_Software, a.Years_Experience
      FROM ArtistLogins l
      LEFT JOIN Artists a ON l.Artist_ID = a.Artist_ID
      ORDER BY l.Role, l.Artist_Name`);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/admin/collab-requests', adminAuth, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query('SELECT * FROM Collab_Requests ORDER BY Sent_At DESC');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.get('/api/admin/user-profile/:id', adminAuth, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ID', sql.Int, req.params.id)
      .query('SELECT * FROM Artists WHERE Artist_ID = @ID');
    if (result.recordset.length === 0)
      return res.status(404).json({ message: 'User not found.' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/songs', adminAuth, async (req, res) => {
  const { artistId, songName, album, releaseDate, duration,
          isrc, featuredArtist, writersCredit, producerName } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('ArtistID',  sql.Int,      artistId)
      .input('SongName',  sql.NVarChar, songName)
      .input('Album',     sql.NVarChar, album          || null)
      .input('Release',   sql.Date,     releaseDate    || null)
      .input('Duration',  sql.NVarChar, duration       || null)
      .input('ISRC',      sql.NVarChar, isrc           || null)
      .input('Featured',  sql.NVarChar, featuredArtist || null)
      .input('Writers',   sql.NVarChar, writersCredit  || null)
      .input('Producer',  sql.NVarChar, producerName   || null)
      .query(`INSERT INTO Songs
        (Artist_ID, Song_Name, Album, Release_Date, Duration_of_Song,
         ISRC, Featured_Artist, Writers_Credit, Producer_Name)
        VALUES
        (@ArtistID, @SongName, @Album, @Release, @Duration,
         @ISRC, @Featured, @Writers, @Producer)`);
    res.json({ message: 'Song added successfully!' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/streams', adminAuth, async (req, res) => {
  const { artistId, songId, platform, streamCount, dateRecorded } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('ArtistID',     sql.Int,      artistId)
      .input('SongID',       sql.Int,      songId       || null)
      .input('Platform',     sql.NVarChar, platform)
      .input('StreamCount',  sql.Int,      streamCount)
      .input('DateRecorded', sql.Date,     dateRecorded || null)
      .query(`INSERT INTO Streams
        (Artist_ID, Song_ID, Streaming_Platform, Stream_Count, Date_Recorded)
        VALUES (@ArtistID, @SongID, @Platform, @StreamCount, @DateRecorded)`);
    res.json({ message: 'Stream data added!' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/royalties', adminAuth, async (req, res) => {
  const { artistId, platform, labelName, amount, paymentDate, status } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('ArtistID',    sql.Int,      artistId)
      .input('Platform',    sql.NVarChar, platform    || null)
      .input('Label',       sql.NVarChar, labelName   || null)
      .input('Amount',      sql.Decimal,  amount)
      .input('PaymentDate', sql.Date,     paymentDate || null)
      .input('Status',      sql.NVarChar, status      || 'Pending')
      .query(`INSERT INTO Royalties
        (Artist_ID, Streaming_Platform, Label_Name, Amount, Payment_Date, Status_On_Royaltiy)
        VALUES (@ArtistID, @Platform, @Label, @Amount, @PaymentDate, @Status)`);
    res.json({ message: 'Royalty payment added!' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

app.post('/api/admin/contracts', adminAuth, async (req, res) => {
  const { artistId, labelName, dealType, artistPct, managerPct,
          labelPct, artistLawyer, managerLawyer, startDate, endDate } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('ArtistID',      sql.Int,      artistId)
      .input('Label',         sql.NVarChar, labelName      || null)
      .input('DealType',      sql.NVarChar, dealType       || null)
      .input('ArtistPct',     sql.Decimal,  artistPct      || 0)
      .input('ManagerPct',    sql.Decimal,  managerPct     || 0)
      .input('LabelPct',      sql.Decimal,  labelPct       || 0)
      .input('ArtistLawyer',  sql.NVarChar, artistLawyer   || null)
      .input('ManagerLawyer', sql.NVarChar, managerLawyer  || null)
      .input('StartDate',     sql.Date,     startDate      || null)
      .input('EndDate',       sql.Date,     endDate        || null)
      .query(`INSERT INTO Contracts
        (Artist_ID, Label_Name, Deal_Type,
         Ownership_Percent_Artist, Ownership_Percent_Manager, Ownership_Percent_Label,
         Artist_Lawyer, Manager_Lawyer, Contract_Start_Date, Contract_End_Date)
        VALUES
        (@ArtistID, @Label, @DealType,
         @ArtistPct, @ManagerPct, @LabelPct,
         @ArtistLawyer, @ManagerLawyer, @StartDate, @EndDate)`);
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
    const pool    = await getPool();
    const updates = [];
    const inputs  = [];
    const add = (col, param, type, val) => {
      if (val !== null && val !== undefined && val !== '') {
        updates.push(`${col} = @${param}`);
        inputs.push({ name: param, type, value: val });
      }
    };
    add('Genre_Specialty',      'Genre',     sql.NVarChar, genre);
    add('ASCAP_ID_2',           'Ascap',     sql.NVarChar, ascapId);
    add('Label_Name',           'Label',     sql.NVarChar, labelName);
    add('Label_Owner',          'Owner',     sql.NVarChar, labelOwner);
    add('Roster_Size',          'Roster',    sql.Int,      rosterSize ? parseInt(rosterSize) : null);
    add('Manager_Name',         'Manager',   sql.NVarChar, managerName);
    add('DAW_Software',         'DAW',       sql.NVarChar, dawSoftware);
    add('Engineer_Type',        'EngType',   sql.NVarChar, engineerType);
    add('Studio_Name',          'Studio',    sql.NVarChar, studioName);
    add('Creative_SubField',    'SubField',  sql.NVarChar, subField);
    add('Years_Experience',     'YearsExp',  sql.Int,      yearsExp ? parseInt(yearsExp) : null);
    add('Bio',                  'Bio',       sql.NVarChar, bio);
    add('Website_URL',          'Website',   sql.NVarChar, websiteUrl);
    add('Portfolio_URL',        'Portfolio', sql.NVarChar, portfolioUrl);
    add('Artist_Spotify_URL',   'Spotify',   sql.NVarChar, spotify);
    add('Artist_Apple_URL',     'Apple',     sql.NVarChar, apple);
    add('Artist_Instagram_URL', 'Instagram', sql.NVarChar, instagram);
    add('Artist_TikTok_URL',    'TikTok',    sql.NVarChar, tiktok);
    add('Artist_Youtube_URL',   'YouTube',   sql.NVarChar, youtube);
    if (updates.length === 0)
      return res.status(400).json({ message: 'Nothing to update.' });
    const request = pool.request().input('ArtistID', sql.Int, artistId);
    inputs.forEach(i => request.input(i.name, i.type, i.value));
    await request.query(`UPDATE Artists SET ${updates.join(', ')} WHERE Artist_ID = @ArtistID`);
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
// START SERVER
// ════════════════════════════════════════════════════════════════

// ── FORGOT PASSWORD ──────────────────────────────────────────────

// POST /api/forgot-password — sends reset email
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required.' });
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('Email', sql.NVarChar, email)
      .query('SELECT Login_ID, Artist_Name FROM ArtistLogins WHERE Artist_Email = @Email');
    if (result.recordset.length === 0)
      return res.json({ message: 'If that email is registered, a reset link is on its way.' });
    const user   = result.recordset[0];
    const crypto = require('crypto');
    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    await pool.request()
      .input('LoginID',   sql.Int,      user.Login_ID)
      .input('Token',     sql.NVarChar, token)
      .input('ExpiresAt', sql.DateTime, expiry)
      .query(`INSERT INTO Password_Reset_Tokens (Login_ID, Token, Expires_At)
              VALUES (@LoginID, @Token, @ExpiresAt)`);
    const resetUrl = process.env.APP_URL + '/reset-password.html?token=' + token;
    const html = `
      <div style="font-family:Arial;max-width:500px;margin:0 auto;
        background:#111;color:#eee;padding:32px;border-radius:12px;">
        <h1 style="color:#D4AF37;">Tha Artist Portal</h1>
        <p style="color:#888;">Your data. Your leverage.</p>
        <div style="background:#1a1a1a;border-left:4px solid #D4AF37;
          border-radius:8px;padding:20px;margin-bottom:24px;">
          <p style="color:#eee;margin:0 0 8px;">Hi ${user.Artist_Name},</p>
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

// POST /api/reset-password — validates token and sets new password
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    return res.status(400).json({ message: 'Token and new password are required.' });
  if (newPassword.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('Token', sql.NVarChar, token)
      .query('SELECT Token_ID, Login_ID, Expires_At, Used FROM Password_Reset_Tokens WHERE Token = @Token');
    if (result.recordset.length === 0)
      return res.status(400).json({ message: 'Invalid reset link. Please request a new one.' });
    const rec = result.recordset[0];
    if (rec.Used)
      return res.status(400).json({ message: 'This link has already been used. Please request a new one.' });
    if (new Date() > new Date(rec.Expires_At))
      return res.status(400).json({ message: 'This link has expired. Please request a new one.' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.request()
      .input('Hash',    sql.NVarChar, hash)
      .input('LoginID', sql.Int,      rec.Login_ID)
      .query('UPDATE ArtistLogins SET Password_Hash = @Hash WHERE Login_ID = @LoginID');
    await pool.request()
      .input('TokenID', sql.Int, rec.Token_ID)
      .query('UPDATE Password_Reset_Tokens SET Used = 1 WHERE Token_ID = @TokenID');
    res.json({ message: 'Password reset successfully!' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ message: 'Something went wrong. Try again.' });
  }
});

// ════════════════════════════════════════════════════════════════
// SPOTIFY INTEGRATION ROUTES
// ════════════════════════════════════════════════════════════════

const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
  'user-library-read'
].join(' ');

// ── Helper: get valid Spotify access token (refresh if expired) ──
async function getSpotifyToken(pool, loginId) {
  const result = await pool.request()
    .input('LoginID', sql.Int, loginId)
    .query('SELECT * FROM Spotify_Tokens WHERE Login_ID = @LoginID');

  if (!result.recordset.length) return null;
  const tok = result.recordset[0];

  // If token still valid, return it
  if (new Date() < new Date(tok.Expires_At)) return tok.Access_Token;

  // Token expired — refresh it
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: tok.Refresh_Token
  });
  const creds = Buffer.from(
    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
  ).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: {
      'Authorization': 'Basic ' + creds,
      'Content-Type':  'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!res.ok) return null;
  const data = await res.json();

  const newExpiry = new Date(Date.now() + data.expires_in * 1000);
  await pool.request()
    .input('LoginID',     sql.Int,      loginId)
    .input('AccessToken', sql.NVarChar, data.access_token)
    .input('ExpiresAt',   sql.DateTime, newExpiry)
    .query(`UPDATE Spotify_Tokens
            SET Access_Token = @AccessToken, Expires_At = @ExpiresAt, Updated_At = GETDATE()
            WHERE Login_ID = @LoginID`);

  return data.access_token;
}

// ── Helper: get public artist data using Client Credentials ──────
async function getSpotifyClientToken() {
  const creds = Buffer.from(
    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
  ).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: {
      'Authorization': 'Basic ' + creds,
      'Content-Type':  'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await res.json();
  return data.access_token;
}

// ── Extract Spotify Artist ID from URL ───────────────────────────
function extractSpotifyArtistId(url) {
  if (!url) return null;
  const match = url.match(/artist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// GET /api/spotify/connect — redirect to Spotify login
app.get('/api/spotify/connect', authMiddleware, (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.SPOTIFY_CLIENT_ID,
    scope:         SPOTIFY_SCOPES,
    redirect_uri:  process.env.APP_URL + '/api/auth/spotify/callback',
    state:         req.artist.loginId.toString()
  });
  res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
});

// GET /api/auth/spotify/callback — Spotify redirects here after login
app.get('/api/auth/spotify/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect('/dashboard.html?spotify=error&reason=' + error);
  }

  const loginId = parseInt(state);
  if (!loginId) return res.redirect('/dashboard.html?spotify=error&reason=invalid_state');

  try {
    const creds = Buffer.from(
      process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
    ).toString('base64');

    // Exchange code for tokens
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: {
        'Authorization': 'Basic ' + creds,
        'Content-Type':  'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: process.env.APP_URL + '/api/auth/spotify/callback'
      }).toString()
    });

    if (!tokenRes.ok) throw new Error('Token exchange failed');
    const tokens = await tokenRes.json();
    const expiry  = new Date(Date.now() + tokens.expires_in * 1000);

    // Get Spotify user profile
    const profileRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': 'Bearer ' + tokens.access_token }
    });
    const profile = await profileRes.json();

    const pool = await getPool();

    // Check if artist has a Spotify URL set — extract artist ID
    const artistResult = await pool.request()
      .input('LoginID', sql.Int, loginId)
      .query(`SELECT a.Artist_Spotify_URL FROM ArtistLogins l
              LEFT JOIN Artists a ON l.Artist_ID = a.Artist_ID
              WHERE l.Login_ID = @LoginID`);

    let spotifyArtistId = null;
    if (artistResult.recordset.length && artistResult.recordset[0].Artist_Spotify_URL) {
      spotifyArtistId = extractSpotifyArtistId(artistResult.recordset[0].Artist_Spotify_URL);
    }

    // Upsert Spotify token
    const existing = await pool.request()
      .input('LoginID', sql.Int, loginId)
      .query('SELECT 1 FROM Spotify_Tokens WHERE Login_ID = @LoginID');

    if (existing.recordset.length) {
      await pool.request()
        .input('LoginID',       sql.Int,      loginId)
        .input('AccessToken',   sql.NVarChar, tokens.access_token)
        .input('RefreshToken',  sql.NVarChar, tokens.refresh_token)
        .input('ExpiresAt',     sql.DateTime, expiry)
        .input('SpotifyUserID', sql.NVarChar, profile.id)
        .input('ArtistID',      sql.NVarChar, spotifyArtistId)
        .input('DisplayName',   sql.NVarChar, profile.display_name)
        .query(`UPDATE Spotify_Tokens SET
                Access_Token = @AccessToken, Refresh_Token = @RefreshToken,
                Expires_At = @ExpiresAt, Spotify_User_ID = @SpotifyUserID,
                Spotify_Artist_ID = @ArtistID, Display_Name = @DisplayName,
                Updated_At = GETDATE()
                WHERE Login_ID = @LoginID`);
    } else {
      await pool.request()
        .input('LoginID',       sql.Int,      loginId)
        .input('AccessToken',   sql.NVarChar, tokens.access_token)
        .input('RefreshToken',  sql.NVarChar, tokens.refresh_token)
        .input('ExpiresAt',     sql.DateTime, expiry)
        .input('SpotifyUserID', sql.NVarChar, profile.id)
        .input('ArtistID',      sql.NVarChar, spotifyArtistId)
        .input('DisplayName',   sql.NVarChar, profile.display_name)
        .query(`INSERT INTO Spotify_Tokens
                (Login_ID, Access_Token, Refresh_Token, Expires_At,
                 Spotify_User_ID, Spotify_Artist_ID, Display_Name)
                VALUES (@LoginID, @AccessToken, @RefreshToken, @ExpiresAt,
                 @SpotifyUserID, @ArtistID, @DisplayName)`);
    }

    res.redirect('/dashboard.html?spotify=connected');
  } catch (err) {
    console.error('Spotify callback error:', err.message);
    res.redirect('/dashboard.html?spotify=error&reason=' + encodeURIComponent(err.message));
  }
});

// GET /api/spotify/status — check if connected
app.get('/api/spotify/status', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('LoginID', sql.Int, req.artist.loginId)
      .query('SELECT Display_Name, Spotify_User_ID, Spotify_Artist_ID, Updated_At FROM Spotify_Tokens WHERE Login_ID = @LoginID');
    if (result.recordset.length) {
      res.json({ connected: true, ...result.recordset[0] });
    } else {
      res.json({ connected: false });
    }
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// GET /api/spotify/disconnect — remove Spotify connection
app.delete('/api/spotify/disconnect', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('LoginID', sql.Int, req.artist.loginId)
      .query('DELETE FROM Spotify_Tokens WHERE Login_ID = @LoginID');
    res.json({ message: 'Spotify disconnected.' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// GET /api/spotify/public-stats — Option 1: public artist data (no login needed)
// Uses Spotify URL from artist profile
app.get('/api/spotify/public-stats', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();

    // Get artist's Spotify URL
    const result = await pool.request()
      .input('ArtistID', sql.Int, req.artist.artistId)
      .query('SELECT Artist_Spotify_URL FROM Artists WHERE Artist_ID = @ArtistID');

    if (!result.recordset.length || !result.recordset[0].Artist_Spotify_URL) {
      return res.json({ connected: false, message: 'No Spotify URL set in profile.' });
    }

    const artistId = extractSpotifyArtistId(result.recordset[0].Artist_Spotify_URL);
    if (!artistId) return res.json({ connected: false, message: 'Invalid Spotify URL.' });

    const token = await getSpotifyClientToken();

    // Get artist profile
    const artistRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!artistRes.ok) throw new Error('Artist not found on Spotify');
    const artist = await artistRes.json();

    // Get top tracks
    const tracksRes = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    const tracksData = await tracksRes.json();

    res.json({
      connected:   true,
      type:        'public',
      name:        artist.name,
      followers:   artist.followers?.total || 0,
      popularity:  artist.popularity || 0,
      genres:      artist.genres || [],
      image:       artist.images?.[0]?.url || null,
      topTracks:   (tracksData.tracks || []).slice(0, 5).map(t => ({
        name:        t.name,
        album:       t.album?.name,
        popularity:  t.popularity,
        preview_url: t.preview_url,
        image:       t.album?.images?.[0]?.url
      }))
    });
  } catch (err) {
    console.error('Spotify public stats error:', err.message);
    res.status(500).json({ message: 'Failed to fetch Spotify data.', error: err.message });
  }
});

// GET /api/spotify/my-stats — Option 2: personal account data (OAuth required)
app.get('/api/spotify/my-stats', authMiddleware, async (req, res) => {
  try {
    const pool        = await getPool();
    const accessToken = await getSpotifyToken(pool, req.artist.loginId);

    if (!accessToken) {
      return res.json({ connected: false, message: 'Spotify account not connected.' });
    }

    const headers = { 'Authorization': 'Bearer ' + accessToken };

    // Get personal top tracks, top artists, recently played
    const [topTracksRes, topArtistsRes, recentRes] = await Promise.all([
      fetch('https://api.spotify.com/v1/me/top/tracks?limit=5&time_range=short_term', { headers }),
      fetch('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term', { headers }),
      fetch('https://api.spotify.com/v1/me/player/recently-played?limit=10', { headers })
    ]);

    const [topTracks, topArtists, recent] = await Promise.all([
      topTracksRes.json(),
      topArtistsRes.json(),
      recentRes.json()
    ]);

    res.json({
      connected:  true,
      type:       'personal',
      topTracks:  (topTracks.items || []).map(t => ({
        name:       t.name,
        artist:     t.artists?.[0]?.name,
        album:      t.album?.name,
        popularity: t.popularity,
        image:      t.album?.images?.[0]?.url
      })),
      topArtists: (topArtists.items || []).map(a => ({
        name:      a.name,
        followers: a.followers?.total,
        genres:    a.genres,
        image:     a.images?.[0]?.url
      })),
      recentTracks: (recent.items || []).map(i => ({
        name:      i.track?.name,
        artist:    i.track?.artists?.[0]?.name,
        playedAt:  i.played_at,
        image:     i.track?.album?.images?.[0]?.url
      }))
    });
  } catch (err) {
    console.error('Spotify my-stats error:', err.message);
    res.status(500).json({ message: 'Failed to fetch personal Spotify data.', error: err.message });
  }
});


startKeepAlive();
startScheduler();

app.listen(PORT, () => console.log(`TAP server running on port ${PORT} | DB: ${process.env.DB_DATABASE}`));

// ════════════════════════════════════════════════════════════════
// DASHBOARD DATA ROUTES (missing from v2 — added here)
// ════════════════════════════════════════════════════════════════

// GET all songs for logged-in artist
app.get('/api/songs', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ArtistID', sql.Int, req.artist.artistId)
      .query('SELECT * FROM Songs WHERE Artist_ID = @ArtistID ORDER BY Created_At DESC');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// GET streams for logged-in artist
app.get('/api/streams', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ArtistID', sql.Int, req.artist.artistId)
      .query('SELECT * FROM Streams WHERE Artist_ID = @ArtistID ORDER BY Date_Recorded DESC');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// GET royalties for logged-in artist
app.get('/api/royalties', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ArtistID', sql.Int, req.artist.artistId)
      .query('SELECT * FROM Royalties WHERE Artist_ID = @ArtistID ORDER BY Payment_Date DESC');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// GET contracts for logged-in artist
app.get('/api/contracts', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ArtistID', sql.Int, req.artist.artistId)
      .query('SELECT * FROM Contracts WHERE Artist_ID = @ArtistID ORDER BY Contract_Start_Date DESC');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// POST test push notification — sends a real push to the logged-in user
app.post('/api/push/test', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    await sendPushToUser(
      pool,
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
