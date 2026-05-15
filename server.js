/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */


require("dotenv").config();
const express = require("express");
const sql     = require("mssql");
const cors    = require("cors");
const bcrypt  = require("bcrypt");
const jwt     = require("jsonwebtoken");


const app  = express();
const PORT = process.env.PORT || 3000;


app.use(cors());
app.use(express.json());
app.use(express.static("public"));


// Database config
const dbConfig = {
  server:   process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     1433,
  options:  {
    encrypt:                true,
    trustServerCertificate: false
  }
};

async function getPool() {
  return await sql.connect(dbConfig);
}

// Email sending helper
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail(to, subject, htmlContent) {
  try {
    await sgMail.send({
      to,
      from:    process.env.SENDGRID_FROM_EMAIL,
      subject,
      html:    htmlContent
    });
    console.log('Email sent to:', to);
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

async function createNotification(pool, recipientId, senderId, senderName,
                                   type, message, link, recipientEmail) {
  await pool.request()
    .input('RecipID',  sql.Int,      recipientId)
    .input('SendID',   sql.Int,      senderId    || null)
    .input('SendName', sql.NVarChar, senderName  || null)
    .input('Type',     sql.NVarChar, type)
    .input('Msg',      sql.NVarChar, message     || null)
    .input('Link',     sql.NVarChar, link        || null)
    .query(`INSERT INTO Notifications
      (Recipient_ID, Sender_ID, Sender_Name, Type, Message, Link)
      VALUES (@RecipID, @SendID, @SendName, @Type, @Msg, @Link)`);

  if (recipientEmail) {
    try {
      const prefs = await pool.request()
        .input('LoginID', sql.Int, recipientId)
        .query('SELECT * FROM Notification_Preferences WHERE Login_ID = @LoginID');
      const p = prefs.recordset[0];
      const emailEnabled = !p || p.Email_Alerts === 1;
      if (emailEnabled) {
        const subject = 'TAP Notification -- ' + senderName;
        const html = `
          <div style="font-family:Arial; max-width:500px; margin:0 auto;
            background:#111; color:#eee; padding:32px; border-radius:12px;">
            <h1 style="color:#D4AF37; margin-bottom:8px;">Tha Artist Portal</h1>
            <p style="color:#888; margin-bottom:24px;">Your data. Your leverage.</p>
            <div style="background:#1a1a1a; border-left:4px solid #D4AF37;
              border-radius:8px; padding:20px; margin-bottom:24px;">
              <p style="color:#eee; font-size:1rem; margin:0;">${message}</p>
            </div>
            <a href="${process.env.APP_URL}/dashboard.html"
               style="background:#B8860B; color:#000; padding:12px 24px;
               border-radius:6px; text-decoration:none; font-weight:bold;">
              View on TAP</a>
            <p style="color:#444; font-size:0.75rem; margin-top:24px;">
              Copyright 2026 BOLAJI B ADEEKO LLC. All Rights Reserved.</p>
          </div>`;
        await sendEmail(recipientEmail, subject, html);
      }
    } catch (err) {
      console.error('Notification email error:', err.message);
    }
  }
}

// ── Nightly data cleanup ─────────────────────────────────────────
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

    // Archive old staging records
    await pool.request().query(`
      UPDATE Artist_Registration_Staging
      SET Status = 'Archived'
      WHERE Status IN ('Rejected','Approved')
      AND Submitted_At < DATEADD(DAY, -90, GETDATE())
    `);

    console.log('Nightly cleanup completed successfully!');
  } catch (err) {
    console.error('Nightly cleanup error:', err.message);
  }
}

// Schedule cleanup to run every night at 2am
function scheduleMidnightCleanup() {
  const now       = new Date();
  const night     = new Date();
  night.setHours(2, 0, 0, 0);
  if (night <= now) night.setDate(night.getDate() + 1);
  const msUntil2am = night - now;
  setTimeout(() => {
    runNightlyCleanup();
    setInterval(runNightlyCleanup, 24 * 60 * 60 * 1000);
  }, msUntil2am);
  console.log('Nightly cleanup scheduled for 2am');
}

scheduleMidnightCleanup();

// Middleware to verify login token
function authMiddleware(req, res, next) {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ message: "Not logged in" });
  try {
    req.artist = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Session expired. Please log in again." });
  }
}


// REGISTER -- all roles with TAP ID generation
app.post('/api/register', async (req, res) => {
  const {
    role, email, password, tapIdLink,
    // Common fields
    name, phone, city, state, country,
    instagram, tiktok, spotify, apple, youtube, website, bio,
    // Artist specific
    genre, ascapId, signedToLabel,
    // Manager specific
    labelName,
    // Producer specific
    dawSoftware, genreSpecialty, yearsExperience,
    // Engineer specific
    engineerType, studioName,
    // Creative specific
    creativeField, creativeSubField, portfolioUrl
  } = req.body;


  if (!role || !email || !password || !name)
    return res.status(400).json({ message: 'Role, name, email and password are required.' });


  try {
    const pool = await getPool();


    // Check for duplicate email
    const dupCheck = await pool.request()
      .input('Email', sql.NVarChar, email)
      .query('SELECT 1 FROM ArtistLogins WHERE Artist_Email = @Email');
    if (dupCheck.recordset.length > 0)
      return res.status(409).json({ message: 'An account with this email already exists.' });


    const pendingCheck = await pool.request()
      .input('Email2', sql.NVarChar, email)
      .query("SELECT 1 FROM Artist_Registration_Staging WHERE Artist_Email = @Email2 AND Status = 'Pending'");
    if (pendingCheck.recordset.length > 0)
      return res.status(409).json({ message: 'A registration for this email is already pending.' });


    const hash  = await bcrypt.hash(password, 12);
    const tapId = await generateTapId(role);


    // Insert into staging with role info
await pool.request()
  .input('Name',      sql.NVarChar, name)
  .input('Email',     sql.NVarChar, email)
  .input('Hash',      sql.NVarChar, hash)
  .input('Role',      sql.NVarChar, role      || 'Artist')
  .input('Phone',     sql.NVarChar, phone     || null)
  .input('City',      sql.NVarChar, city      || null)
  .input('State',     sql.NVarChar, state     || null)
  .input('Genre',     sql.NVarChar, genre     || null)
  .input('Instagram', sql.NVarChar, instagram || null)
  .input('TikTok',    sql.NVarChar, tiktok    || null)
  .input('Spotify',   sql.NVarChar, spotify   || null)
  .input('Apple',     sql.NVarChar, apple     || null)
  .input('YouTube',   sql.NVarChar, youtube   || null)
  .query(`INSERT INTO Artist_Registration_Staging
    (Artist_Name, Artist_Email, Password_Hash, Role,
     Artist_Phone, Artist_City, Artist_State, Genre_Name,
     Instagram_URL, TikTok_URL, Spotify_URL, Apple_URL, YouTube_URL)
    VALUES (@Name, @Email, @Hash, @Role,
     @Phone, @City, @State, @Genre,
     @Instagram, @TikTok, @Spotify, @Apple, @YouTube)`);


    // Store role details in session for approval processing
    res.json({
      message: 'Registration submitted! You will receive access once your account is reviewed.',
      tapId,
      role
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed.', error: err.message });
  }
});


// LOGIN -- returns role and TAP ID
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('Email', sql.NVarChar, email)
      .query('SELECT * FROM ArtistLogins WHERE Artist_Email = @Email');
    if (result.recordset.length === 0)
      return res.status(401).json({ message: 'Email not found.' });
    const artist = result.recordset[0];
    const match  = await bcrypt.compare(password, artist.Password_Hash);
    if (!match) return res.status(401).json({ message: 'Incorrect password.' });
    const token = jwt.sign(
      {
        loginId:  artist.Login_ID,
        artistId: artist.Artist_ID,
        name:     artist.Artist_Name,
        email:    artist.Artist_Email,
        role:     artist.Role || 'Artist',
        tapId:    artist.TAP_ID
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      artistName: artist.Artist_Name,
      role:       artist.Role || 'Artist',
      tapId:      artist.TAP_ID
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed.', error: err.message });
  }
});



// GET streams for logged-in artist
app.get("/api/streams", authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input("ArtistID", sql.Int, req.artist.artistId)
      .query("SELECT Streaming_Platform, SUM(Stream_Count) AS Total_Streams FROM Streams WHERE Artist_ID = @ArtistID GROUP BY Streaming_Platform ORDER BY Total_Streams DESC");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: "Error loading streams.", error: err.message }); }
});


// GET royalties for logged-in artist
app.get("/api/royalties", authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input("ArtistID", sql.Int, req.artist.artistId)
      .query("SELECT Streaming_Platform, Label_Name, Amount, Payment_Date, Status_On_Royaltiy FROM Royalties WHERE Artist_ID = @ArtistID ORDER BY Payment_Date DESC");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: "Error loading royalties.", error: err.message }); }
});


// GET songs for logged-in artist
app.get("/api/songs", authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input("ArtistID", sql.Int, req.artist.artistId)
      .query("SELECT Song_Name, Album, Release_Date, Duration_of_Song, ISRC FROM Songs WHERE Artist_ID = @ArtistID ORDER BY Release_Date DESC");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: "Error loading songs.", error: err.message }); }
});


// GET contracts for logged-in artist
app.get("/api/contracts", authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input("ArtistID", sql.Int, req.artist.artistId)
      .query("SELECT Label_Name, Deal_Type, Ownership_Percent_Artist, Ownership_Percent_Manager, Ownership_Percent_Label, Contract_Start_Date, Contract_End_Date FROM Contracts WHERE Artist_ID = @ArtistID");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: "Error loading contracts.", error: err.message }); }
});


// ADMIN -- get pending registrations
app.get("/api/admin/pending", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: "Not authorized." });
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query("SELECT Staging_ID, Artist_Name, Artist_Email, Submitted_At FROM Artist_Registration_Staging WHERE Status = 'Pending' ORDER BY Submitted_At ASC");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: "Error.", error: err.message }); }
});


// ADMIN -- approve registration and create role record
app.post('/api/admin/approve/:id', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: 'Not authorized.' });
  try {
    const pool    = await getPool();
    const staging = await pool.request()
      .input('ID', sql.Int, req.params.id)
      .query("SELECT * FROM Artist_Registration_Staging WHERE Staging_ID = @ID AND Status = 'Pending'");
    if (staging.recordset.length === 0)
      return res.status(404).json({ message: 'Record not found or already processed.' });


    const rec   = staging.recordset[0];
    const role  = rec.Role || 'Artist';
    const tapId = await generateTapId(role);


    // Insert into Artists table
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


    // Create login record
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


    // Mark staging approved
    await pool.request()
      .input('ID', sql.Int, req.params.id)
      .query("UPDATE Artist_Registration_Staging SET Status = 'Approved' WHERE Staging_ID = @ID");


    res.json({ message: 'Approved! TAP ID: ' + tapId });
  } catch (err) {
    res.status(500).json({ message: 'Approval failed.', error: err.message });
  }
});


// ADMIN -- reject a registration
app.post("/api/admin/reject/:id", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: "Not authorized." });
  const { reason } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input("ID",     sql.Int,      req.params.id)
      .input("Reason", sql.NVarChar, reason || "No reason given")
      .query("UPDATE Artist_Registration_Staging SET Status = 'Rejected', Reject_Reason = @Reason WHERE Staging_ID = @ID");
    res.json({ message: "Registration rejected." });
  } catch (err) { res.status(500).json({ message: "Rejection failed.", error: err.message }); }
});

// GET artist profile
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input("ArtistID", sql.Int, req.artist.artistId)
      .query("SELECT * FROM Artists WHERE Artist_ID = @ArtistID");
    if (result.recordset.length === 0)
      return res.status(404).json({ message: "Profile not found." });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: "Error loading profile.", error: err.message });
  }
});

// UPDATE artist profile -- only updates fields that have values
app.put("/api/profile", authMiddleware, async (req, res) => {
  const { artistName, email, phone, city, state, genre,
          instagram, tiktok, spotify, apple, youtube } = req.body;
  try {
    const pool = await getPool();

    // Build the SET clause dynamically -- only include fields that were filled in
    const updates = [];
    const inputs  = [];

    if (artistName && artistName.trim()) {
      updates.push("Artist_Name = @Name");
      inputs.push({ name: "Name", type: sql.NVarChar, value: artistName.trim() });
    }
    if (email && email.trim()) {
      updates.push("Artist_Email = @Email");
      inputs.push({ name: "Email", type: sql.NVarChar, value: email.trim() });
    }
    if (phone && phone.trim()) {
      updates.push("Artist_Phone_Number = @Phone");
      inputs.push({ name: "Phone", type: sql.NVarChar, value: phone.trim() });
    }
    if (city && city.trim()) {
      updates.push("Artist_City = @City");
      inputs.push({ name: "City", type: sql.NVarChar, value: city.trim() });
    }
    if (state && state.trim()) {
      updates.push("Artist_State = @State");
      inputs.push({ name: "State", type: sql.NVarChar, value: state.trim() });
    }
    if (instagram && instagram.trim()) {
      updates.push("Artist_Instagram_URL = @Instagram");
      inputs.push({ name: "Instagram", type: sql.NVarChar, value: instagram.trim() });
    }
    if (tiktok && tiktok.trim()) {
      updates.push("Artist_TikTok_URL = @TikTok");
      inputs.push({ name: "TikTok", type: sql.NVarChar, value: tiktok.trim() });
    }
    if (spotify && spotify.trim()) {
      updates.push("Artist_Spotify_URL = @Spotify");
      inputs.push({ name: "Spotify", type: sql.NVarChar, value: spotify.trim() });
    }
    if (apple && apple.trim()) {
      updates.push("Artist_Apple_URL = @Apple");
      inputs.push({ name: "Apple", type: sql.NVarChar, value: apple.trim() });
    }
    if (youtube && youtube.trim()) {
      updates.push("Artist_Youtube_URL = @YouTube");
      inputs.push({ name: "YouTube", type: sql.NVarChar, value: youtube.trim() });
    }

    // If nothing was filled in dont do anything
    if (updates.length === 0)
      return res.status(400).json({ message: "No changes were made -- all fields were empty." });

    // Build and run the query with only the filled in fields
    const request = pool.request().input("ArtistID", sql.Int, req.artist.artistId);
    inputs.forEach(i => request.input(i.name, i.type, i.value));
    await request.query(`UPDATE Artists SET ${updates.join(", ")} WHERE Artist_ID = @ArtistID`);

    // Update ArtistLogins only if name or email changed
    if (artistName && artistName.trim() || email && email.trim()) {
      const loginUpdates = [];
      const loginRequest = pool.request().input("ArtistID", sql.Int, req.artist.artistId);
      if (artistName && artistName.trim()) {
        loginUpdates.push("Artist_Name = @Name");
        loginRequest.input("Name", sql.NVarChar, artistName.trim());
      }
      if (email && email.trim()) {
        loginUpdates.push("Artist_Email = @Email");
        loginRequest.input("Email", sql.NVarChar, email.trim());
      }
      await loginRequest.query(`UPDATE ArtistLogins SET ${loginUpdates.join(", ")} WHERE Artist_ID = @ArtistID`);
    }

    res.json({ message: "Profile updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Update failed.", error: err.message });
  }
});

// ── ARTIST -- Add a song ────────────────────────────────────────
app.post("/api/songs", authMiddleware, async (req, res) => {
  const { songName, album, releaseDate, duration, isrc,
          featuredArtist, writersCredit, producerName } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input("ArtistID",       sql.Int,      req.artist.artistId)
      .input("SongName",       sql.NVarChar, songName)
      .input("Album",          sql.NVarChar, album        || null)
      .input("ReleaseDate",    sql.Date,     releaseDate  || null)
      .input("Duration",       sql.NVarChar, duration     || null)
      .input("ISRC",           sql.NVarChar, isrc         || null)
      .input("Featured",       sql.NVarChar, featuredArtist || null)
      .input("Writers",        sql.NVarChar, writersCredit  || null)
      .input("Producer",       sql.NVarChar, producerName   || null)
      .query(`INSERT INTO Songs
        (Artist_ID, Song_Name, Album, Release_Date,
         Duration_of_Song, ISRC, Featured_Artist,
         Writers_Credit, Producer_Name)
        VALUES
        (@ArtistID, @SongName, @Album, @ReleaseDate,
         @Duration, @ISRC, @Featured, @Writers, @Producer)`);
    res.json({ message: "Song added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Error adding song.", error: err.message });
  }
});

// ── ARTIST -- Update a song ─────────────────────────────────────
app.put("/api/songs/:id", authMiddleware, async (req, res) => {
  const { songName, album, releaseDate, duration, isrc,
          featuredArtist, writersCredit, producerName } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input("SongID",         sql.Int,      req.params.id)
      .input("ArtistID",       sql.Int,      req.artist.artistId)
      .input("SongName",       sql.NVarChar, songName)
      .input("Album",          sql.NVarChar, album          || null)
      .input("ReleaseDate",    sql.Date,     releaseDate    || null)
      .input("Duration",       sql.NVarChar, duration       || null)
      .input("ISRC",           sql.NVarChar, isrc           || null)
      .input("Featured",       sql.NVarChar, featuredArtist || null)
      .input("Writers",        sql.NVarChar, writersCredit  || null)
      .input("Producer",       sql.NVarChar, producerName   || null)
      .query(`UPDATE Songs SET
        Song_Name       = @SongName,
        Album           = @Album,
        Release_Date    = @ReleaseDate,
        Duration_of_Song = @Duration,
        ISRC            = @ISRC,
        Featured_Artist = @Featured,
        Writers_Credit  = @Writers,
        Producer_Name   = @Producer
        WHERE Song_ID   = @SongID
        AND   Artist_ID = @ArtistID`);
    res.json({ message: "Song updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Error updating song.", error: err.message });
  }
});

// ── ARTIST -- Delete a song ─────────────────────────────────────
app.delete("/api/songs/:id", authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input("SongID",   sql.Int, req.params.id)
      .input("ArtistID", sql.Int, req.artist.artistId)
      .query("DELETE FROM Songs WHERE Song_ID = @SongID AND Artist_ID = @ArtistID");
    res.json({ message: "Song deleted." });
  } catch (err) {
    res.status(500).json({ message: "Error deleting song.", error: err.message });
  }
});

// ── ADMIN -- Get all artists (for dropdowns) ────────────────────
app.get("/api/admin/artists", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: "Not authorized." });
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query("SELECT Artist_ID, Artist_Name FROM Artists ORDER BY Artist_Name ASC");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: "Error.", error: err.message });
  }
});

// ── ADMIN -- Add a song for any artist ─────────────────────────
app.post("/api/admin/songs", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: "Not authorized." });
  const { artistId, songName, album, releaseDate, duration,
          isrc, featuredArtist, writersCredit, producerName } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input("ArtistID",    sql.Int,      artistId)
      .input("SongName",    sql.NVarChar, songName)
      .input("Album",       sql.NVarChar, album          || null)
      .input("ReleaseDate", sql.Date,     releaseDate    || null)
      .input("Duration",    sql.NVarChar, duration       || null)
      .input("ISRC",        sql.NVarChar, isrc           || null)
      .input("Featured",    sql.NVarChar, featuredArtist || null)
      .input("Writers",     sql.NVarChar, writersCredit  || null)
      .input("Producer",    sql.NVarChar, producerName   || null)
      .query(`INSERT INTO Songs
        (Artist_ID, Song_Name, Album, Release_Date,
         Duration_of_Song, ISRC, Featured_Artist,
         Writers_Credit, Producer_Name)
        VALUES
        (@ArtistID, @SongName, @Album, @ReleaseDate,
         @Duration, @ISRC, @Featured, @Writers, @Producer)`);
    res.json({ message: "Song added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Error adding song.", error: err.message });
  }
});

// ── ADMIN -- Add stream data ────────────────────────────────────
app.post("/api/admin/streams", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: "Not authorized." });
  const { artistId, songId, platform, streamCount, dateRecorded } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input("ArtistID",     sql.Int,      artistId)
      .input("SongID",       sql.Int,      songId       || null)
      .input("Platform",     sql.NVarChar, platform)
      .input("StreamCount",  sql.Int,      streamCount)
      .input("DateRecorded", sql.Date,     dateRecorded || null)
      .query(`INSERT INTO Streams
        (Artist_ID, Song_ID, Streaming_Platform, Stream_Count, Date_Recorded)
        VALUES
        (@ArtistID, @SongID, @Platform, @StreamCount, @DateRecorded)`);
    res.json({ message: "Stream data added!" });
  } catch (err) {
    res.status(500).json({ message: "Error adding streams.", error: err.message });
  }
});

// ── ADMIN -- Add royalty payment ────────────────────────────────
app.post("/api/admin/royalties", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: "Not authorized." });
  const { artistId, platform, labelName, amount, paymentDate, status } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input("ArtistID",    sql.Int,      artistId)
      .input("Platform",    sql.NVarChar, platform    || null)
      .input("Label",       sql.NVarChar, labelName   || null)
      .input("Amount",      sql.Decimal,  amount)
      .input("PaymentDate", sql.Date,     paymentDate || null)
      .input("Status",      sql.NVarChar, status      || "Pending")
      .query(`INSERT INTO Royalties
        (Artist_ID, Streaming_Platform, Label_Name, Amount, Payment_Date, Status_On_Royaltiy)
        VALUES
        (@ArtistID, @Platform, @Label, @Amount, @PaymentDate, @Status)`);
    res.json({ message: "Royalty payment added!" });
  } catch (err) {
    res.status(500).json({ message: "Error adding royalty.", error: err.message });
  }
});

// ── ADMIN -- Add contract ───────────────────────────────────────
app.post("/api/admin/contracts", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: "Not authorized." });
  const { artistId, labelName, dealType, artistPct, managerPct,
          labelPct, artistLawyer, managerLawyer, startDate, endDate } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input("ArtistID",       sql.Int,      artistId)
      .input("Label",          sql.NVarChar, labelName      || null)
      .input("DealType",       sql.NVarChar, dealType       || null)
      .input("ArtistPct",      sql.Decimal,  artistPct      || 0)
      .input("ManagerPct",     sql.Decimal,  managerPct     || 0)
      .input("LabelPct",       sql.Decimal,  labelPct       || 0)
      .input("ArtistLawyer",   sql.NVarChar, artistLawyer   || null)
      .input("ManagerLawyer",  sql.NVarChar, managerLawyer  || null)
      .input("StartDate",      sql.Date,     startDate      || null)
      .input("EndDate",        sql.Date,     endDate        || null)
      .query(`INSERT INTO Contracts
        (Artist_ID, Label_Name, Deal_Type,
         Ownership_Percent_Artist, Ownership_Percent_Manager, Ownership_Percent_Label,
         Artist_Lawyer, Manager_Lawyer, Contract_Start_Date, Contract_End_Date)
        VALUES
        (@ArtistID, @Label, @DealType,
         @ArtistPct, @ManagerPct, @LabelPct,
         @ArtistLawyer, @ManagerLawyer, @StartDate, @EndDate)`);
    res.json({ message: "Contract added!" });
  } catch (err) {
    res.status(500).json({ message: "Error adding contract.", error: err.message });
  }
});


// GET artist social links
app.get("/api/social", authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input("ArtistID", sql.Int, req.artist.artistId)
      .query(`SELECT 
        Artist_Instagram_URL,
        Artist_TikTok_URL,
        Artist_Spotify_URL,
        Artist_Apple_URL,
        Artist_Youtube_URL
        FROM Artists WHERE Artist_ID = @ArtistID`);
    if (result.recordset.length === 0)
      return res.status(404).json({ message: "Artist not found." });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: "Error loading social links.", error: err.message });
  }
});


// Generate unique TAP ID
async function generateTapId(role) {
  const pool  = await getPool();
  const year  = new Date().getFullYear();
  const prefix = {
    'Artist':       'TAP-ART',
    'Manager':      'TAP-MGR',
    'Producer':     'TAP-PRO',
    'Engineer':     'TAP-ENG',
    'Record Label': 'TAP-LBL',
    'Painter':      'TAP-CRE',
    'Filmmaker':    'TAP-CRE',
    'Fashion':      'TAP-CRE',
    'Dancer':       'TAP-CRE',
    'Photographer': 'TAP-CRE',
    'Other':        'TAP-CRE'
  }[role] || 'TAP-USR';
  const result = await pool.request()
    .query('SELECT COUNT(*) AS Total FROM ArtistLogins');
  const num = String(result.recordset[0].Total + 1).padStart(5, '0');
  return prefix + '-' + year + '-' + num;

}

// ADMIN -- get all users by role
app.get('/api/admin/all-users', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: 'Not authorized.' });
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query('SELECT Login_ID, Artist_Name, Artist_Email, Role, TAP_ID, Created_Date FROM ArtistLogins ORDER BY Role, Artist_Name');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error.', error: err.message });
  }
});



// DISCOVER -- Search all creatives
app.get('/api/discover', authMiddleware, async (req, res) => {
  const { name, role, city, state, genre, platform } = req.query;
  try {
    const pool = await getPool();
    const request = pool.request();
    let where = ['l.Login_ID != @MyID'];
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
    if (genre) {
      where.push('a.Genre_ID IS NOT NULL');
    }
    if (platform === 'Spotify') {
      where.push('a.Artist_Spotify_URL IS NOT NULL');
    }
    if (platform === 'Instagram') {
      where.push('a.Artist_Instagram_URL IS NOT NULL');
    }
    if (platform === 'TikTok') {
      where.push('a.Artist_TikTok_URL IS NOT NULL');
    }
    if (platform === 'YouTube') {
      where.push('a.Artist_Youtube_URL IS NOT NULL');
    }
    if (platform === 'Apple Music') {
      where.push('a.Artist_Apple_URL IS NOT NULL');
    }


    const query = `
      SELECT TOP 50
        l.Login_ID, l.Artist_Name, l.Role, l.TAP_ID,
        a.Artist_City, a.Artist_State, a.Artist_Country,
        a.Artist_Instagram_URL, a.Artist_TikTok_URL,
        a.Artist_Spotify_URL, a.Artist_Apple_URL,
        a.Artist_Youtube_URL
      FROM ArtistLogins l
      LEFT JOIN Artists a ON l.Artist_ID = a.Artist_ID
      WHERE ${where.join(' AND ')}
      ORDER BY l.Artist_Name ASC`;


    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Search failed.', error: err.message });
  }
});



// Get public profile by Login_ID
app.get('/api/discover/:id', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ID', sql.Int, req.params.id)
      .query(`
        SELECT
          l.Login_ID, l.Artist_Name, l.Role, l.TAP_ID, l.Created_Date,
          a.Artist_City, a.Artist_State, a.Artist_Country,
          a.Artist_Phone_Number,
          a.Artist_Instagram_URL, a.Artist_TikTok_URL,
          a.Artist_Spotify_URL, a.Artist_Apple_URL,
          a.Artist_Youtube_URL, a.Signed_2_Label,
          a.Manager_Name, a.ASCAP_ID
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



// Send collab request
app.post('/api/collab-request', authMiddleware, async (req, res) => {
  const { receiverLoginId, message } = req.body;
  if (!receiverLoginId)
    return res.status(400).json({ message: 'Receiver is required.' });
  try {
    const pool = await getPool();


    // Check not sending to yourself
    if (parseInt(receiverLoginId) === req.artist.loginId)
      return res.status(400).json({ message: 'You cannot send a request to yourself.' });


    // Check for existing pending request
    const existing = await pool.request()
      .input('SenderID',   sql.Int, req.artist.loginId)
      .input('ReceiverID', sql.Int, receiverLoginId)
      .query("SELECT 1 FROM Collab_Requests WHERE Sender_Login_ID = @SenderID AND Receiver_Login_ID = @ReceiverID AND Status = 'Pending'");
    if (existing.recordset.length > 0)
      return res.status(409).json({ message: 'You already sent a request to this person.' });


    // Get receiver info
    const receiver = await pool.request()
      .input('ID', sql.Int, receiverLoginId)
      .query('SELECT Artist_Name, TAP_ID, Role FROM ArtistLogins WHERE Login_ID = @ID');
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


    res.json({ message: 'Collab request sent to ' + rec.Artist_Name + '!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send request.', error: err.message });
  }
});



// Get collab requests for logged-in user
app.get('/api/collab-requests', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    const sent = await pool.request()
      .input('MyID', sql.Int, req.artist.loginId)
      .query(`SELECT * FROM Collab_Requests
              WHERE Sender_Login_ID = @MyID
              ORDER BY Sent_At DESC`);
    const received = await pool.request()
      .input('MyID2', sql.Int, req.artist.loginId)
      .query(`SELECT * FROM Collab_Requests
              WHERE Receiver_Login_ID = @MyID2
              ORDER BY Sent_At DESC`);
    res.json({ sent: sent.recordset, received: received.recordset });
  } catch (err) {
    res.status(500).json({ message: 'Error loading requests.', error: err.message });
  }
});



// Accept or decline a collab request
app.put('/api/collab-request/:id', authMiddleware, async (req, res) => {
  const { status } = req.body; // 'Accepted' or 'Declined'
  if (!['Accepted','Declined'].includes(status))
    return res.status(400).json({ message: 'Status must be Accepted or Declined.' });
  try {
    const pool = await getPool();
    await pool.request()
      .input('ID',     sql.Int,      req.params.id)
      .input('MyID',   sql.Int,      req.artist.loginId)
      .input('Status', sql.NVarChar, status)
      .query(`UPDATE Collab_Requests
              SET Status = @Status, Responded_At = GETDATE()
              WHERE Request_ID = @ID
              AND Receiver_Login_ID = @MyID`);
    res.json({ message: 'Request ' + status.toLowerCase() + '.' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating request.', error: err.message });
  }
});




// ADMIN -- get all collab requests
app.get('/api/admin/collab-requests', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: 'Not authorized.' });
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query(`SELECT * FROM Collab_Requests ORDER BY Sent_At DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error.', error: err.message });
  }
});



// ADMIN -- get user profile by Artist_ID
app.get('/api/admin/user-profile/:id', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: 'Not authorized.' });
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ID', sql.Int, req.params.id)
      .query('SELECT * FROM Artists WHERE Artist_ID = @ID');
    if (result.recordset.length === 0)
      return res.status(404).json({ message: 'User not found.' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error.', error: err.message });
  }
});



// ADMIN -- update role specific data
app.post('/api/admin/update-role-data', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: 'Not authorized.' });
  const {
    artistId, role, genre, ascapId, labelName, labelOwner,
    rosterSize, managerName, dawSoftware, engineerType,
    studioName, subField, yearsExp, bio, websiteUrl,
    portfolioUrl, spotify, apple, instagram, tiktok, youtube
  } = req.body;
  try {
    const pool = await getPool();
    const updates = [];
    const inputs  = [];
    const add = (col, param, type, val) => {
      if (val !== null && val !== undefined && val !== '') {
        updates.push(col + ' = @' + param);
        inputs.push({ name: param, type, value: val });
      }
    };
    add('Genre_Specialty',       'Genre',     sql.NVarChar, genre);
    add('ASCAP_ID_2',            'Ascap',     sql.NVarChar, ascapId);
    add('Label_Name',            'Label',     sql.NVarChar, labelName);
    add('Label_Owner',           'Owner',     sql.NVarChar, labelOwner);
    add('Roster_Size',           'Roster',    sql.Int,      rosterSize ? parseInt(rosterSize) : null);
    add('Manager_Name',          'Manager',   sql.NVarChar, managerName);
    add('DAW_Software',          'DAW',       sql.NVarChar, dawSoftware);
    add('Engineer_Type',         'EngType',   sql.NVarChar, engineerType);
    add('Studio_Name',           'Studio',    sql.NVarChar, studioName);
    add('Creative_SubField',     'SubField',  sql.NVarChar, subField);
    add('Years_Experience',      'YearsExp',  sql.Int,      yearsExp ? parseInt(yearsExp) : null);
    add('Bio',                   'Bio',       sql.NVarChar, bio);
    add('Website_URL',           'Website',   sql.NVarChar, websiteUrl);
    add('Portfolio_URL',         'Portfolio', sql.NVarChar, portfolioUrl);
    add('Artist_Spotify_URL',    'Spotify',   sql.NVarChar, spotify);
    add('Artist_Apple_URL',      'Apple',     sql.NVarChar, apple);
    add('Artist_Instagram_URL',  'Instagram', sql.NVarChar, instagram);
    add('Artist_TikTok_URL',     'TikTok',    sql.NVarChar, tiktok);
    add('Artist_Youtube_URL',    'YouTube',   sql.NVarChar, youtube);
    if (updates.length === 0)
      return res.status(400).json({ message: 'Nothing to update.' });
    const request = pool.request().input('ArtistID', sql.Int, artistId);
    inputs.forEach(i => request.input(i.name, i.type, i.value));
    await request.query('UPDATE Artists SET ' + updates.join(', ') + ' WHERE Artist_ID = @ArtistID');
    res.json({ message: role + ' data updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Update failed.', error: err.message });
  }
});



// ADMIN -- get all users with role attributes
app.get('/api/admin/all-users', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: 'Not authorized.' });
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query(`SELECT
        l.Login_ID, l.Artist_Name, l.Artist_Email,
        l.Role, l.TAP_ID, l.Artist_ID, l.Created_Date,
        a.Artist_City, a.Artist_State,
        a.Artist_Instagram_URL, a.Artist_TikTok_URL,
        a.Artist_Spotify_URL, a.Artist_Apple_URL,
        a.Artist_Youtube_URL,
        a.Genre_Specialty, a.Creative_Field,
        a.Studio_Name, a.Label_Name,
        a.DAW_Software, a.Years_Experience
        FROM ArtistLogins l
        LEFT JOIN Artists a ON l.Artist_ID = a.Artist_ID
        ORDER BY l.Role, l.Artist_Name`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: 'Error.', error: err.message });
  }
});



// ── NOTIFICATIONS ───────────────────────────────────────────────

// GET unread notification count
app.get('/api/notifications/count', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ID', sql.Int, req.artist.loginId)
      .query('SELECT COUNT(*) AS Unread FROM Notifications WHERE Recipient_ID = @ID AND Is_Read = 0');
    res.json({ unread: result.recordset[0].Unread });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// GET all notifications
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ID', sql.Int, req.artist.loginId)
      .query(`SELECT TOP 50 * FROM Notifications
              WHERE Recipient_ID = @ID
              ORDER BY Created_At DESC`);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// MARK notifications as read
app.put('/api/notifications/read', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('ID', sql.Int, req.artist.loginId)
      .query('UPDATE Notifications SET Is_Read = 1 WHERE Recipient_ID = @ID AND Is_Read = 0');
    res.json({ message: 'Marked as read.' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// GET notification preferences
app.get('/api/notifications/preferences', authMiddleware, async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('ID', sql.Int, req.artist.loginId)
      .query('SELECT * FROM Notification_Preferences WHERE Login_ID = @ID');
    res.json(result.recordset[0] || {
      Collab_Requests: 1, Profile_Views: 1,
      New_Messages: 1, New_Followers: 0,
      New_Users_City: 0, Email_Alerts: 1
    });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// SAVE notification preferences
app.put('/api/notifications/preferences', authMiddleware, async (req, res) => {
  const { collabRequests, profileViews, newMessages,
          newFollowers, newUsersCity, emailAlerts } = req.body;
  try {
    const pool = await getPool();
    const existing = await pool.request()
      .input('ID', sql.Int, req.artist.loginId)
      .query('SELECT 1 FROM Notification_Preferences WHERE Login_ID = @ID');
    if (existing.recordset.length > 0) {
      await pool.request()
        .input('ID',        sql.Int, req.artist.loginId)
        .input('Collab',    sql.Bit, collabRequests ? 1 : 0)
        .input('Profile',   sql.Bit, profileViews  ? 1 : 0)
        .input('Messages',  sql.Bit, newMessages   ? 1 : 0)
        .input('Followers', sql.Bit, newFollowers  ? 1 : 0)
        .input('City',      sql.Bit, newUsersCity  ? 1 : 0)
        .input('Email',     sql.Bit, emailAlerts   ? 1 : 0)
        .query(`UPDATE Notification_Preferences SET
          Collab_Requests=@Collab, Profile_Views=@Profile,
          New_Messages=@Messages, New_Followers=@Followers,
          New_Users_City=@City, Email_Alerts=@Email
          WHERE Login_ID=@ID`);
    } else {
      await pool.request()
        .input('ID',        sql.Int, req.artist.loginId)
        .input('Collab',    sql.Bit, collabRequests ? 1 : 0)
        .input('Profile',   sql.Bit, profileViews  ? 1 : 0)
        .input('Messages',  sql.Bit, newMessages   ? 1 : 0)
        .input('Followers', sql.Bit, newFollowers  ? 1 : 0)
        .input('City',      sql.Bit, newUsersCity  ? 1 : 0)
        .input('Email',     sql.Bit, emailAlerts   ? 1 : 0)
        .query(`INSERT INTO Notification_Preferences
          (Login_ID, Collab_Requests, Profile_Views,
           New_Messages, New_Followers, New_Users_City, Email_Alerts)
          VALUES (@ID,@Collab,@Profile,@Messages,@Followers,@City,@Email)`);
    }
    res.json({ message: 'Preferences saved!' });
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// ── MESSAGES ─────────────────────────────────────────────────────

// GET conversations list
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
        GROUP BY m.Conversation_ID, m.Sender_ID, m.Receiver_ID,
                 m.Sender_Name, l2.Artist_Name
        ORDER BY Last_Message_At DESC`);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error.', error: err.message }); }
});

// GET messages in a conversation
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

// SEND a message
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
    const convId = [req.artist.loginId, parseInt(receiverId)].sort((a,b)=>a-b).join('-');
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



// ADMIN -- trigger data cleanup manually
app.post('/api/admin/cleanup', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: 'Not authorized.' });
  try {
    await runNightlyCleanup();
    res.json({ message: 'Data cleanup completed successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Cleanup failed.', error: err.message });
  }
});





// TEMP -- test email route -- remove after testing
app.get('/api/test-email', async (req, res) => {
  try {
    await sendEmail(
      'badeeko93@gmail.com',
      'TAP Email Test',
      '<h1 style="color:#D4AF37">TAP Email is working!</h1><p>Your notifications are set up correctly.</p>'
    );
    res.json({ message: 'Test email sent! Check your inbox.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed.', error: err.message });
  }
});


app.listen(PORT, () => console.log("Server running on port " + PORT));
