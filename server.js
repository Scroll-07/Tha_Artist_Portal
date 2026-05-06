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
  options:  { encrypt: false, trustServerCertificate: true }
};


async function getPool() {
  return await sql.connect(dbConfig);
}


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


// REGISTER -- sends to staging table first
app.post("/api/register", async (req, res) => {
  const { artistName, email, password,
          phone, city, state, genre,
          instagram, tiktok, spotify, apple, youtube } = req.body;

  if (!artistName || !email || !password)
    return res.status(400).json({ message: "Name, email and password are required." });

  try {
    const pool = await getPool();

    const dupCheck = await pool.request()
      .input("Email", sql.NVarChar, email)
      .query("SELECT 1 FROM ArtistLogins WHERE Artist_Email = @Email");
    if (dupCheck.recordset.length > 0)
      return res.status(409).json({ message: "An account with this email already exists." });

    const pendingCheck = await pool.request()
      .input("Email2", sql.NVarChar, email)
      .query("SELECT 1 FROM Artist_Registration_Staging WHERE Artist_Email = @Email2 AND Status = 'Pending'");
    if (pendingCheck.recordset.length > 0)
      return res.status(409).json({ message: "A registration for this email is already pending review." });

    const hash = await bcrypt.hash(password, 12);

    await pool.request()
      .input("Name",      sql.NVarChar, artistName)
      .input("Email",     sql.NVarChar, email)
      .input("Hash",      sql.NVarChar, hash)
      .input("Phone",     sql.NVarChar, phone     || null)
      .input("City",      sql.NVarChar, city      || null)
      .input("State",     sql.NVarChar, state     || null)
      .input("Genre",     sql.NVarChar, genre     || null)
      .input("Instagram", sql.NVarChar, instagram || null)
      .input("TikTok",    sql.NVarChar, tiktok    || null)
      .input("Spotify",   sql.NVarChar, spotify   || null)
      .input("Apple",     sql.NVarChar, apple     || null)
      .input("YouTube",   sql.NVarChar, youtube   || null)
      .query(`INSERT INTO Artist_Registration_Staging
        (Artist_Name, Artist_Email, Password_Hash,
         Artist_Phone, Artist_City, Artist_State, Genre_Name,
         Instagram_URL, TikTok_URL, Spotify_URL, Apple_URL, YouTube_URL)
        VALUES
        (@Name, @Email, @Hash,
         @Phone, @City, @State, @Genre,
         @Instagram, @TikTok, @Spotify, @Apple, @YouTube)`);

    res.json({ message: "Registration submitted! You will receive access once your account is reviewed." });
  } catch (err) {
    res.status(500).json({ message: "Registration failed.", error: err.message });
  }
});


// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input("Email", sql.NVarChar, email)
      .query("SELECT * FROM ArtistLogins WHERE Artist_Email = @Email");
    if (result.recordset.length === 0)
      return res.status(401).json({ message: "Email not found." });
    const artist = result.recordset[0];
    const match  = await bcrypt.compare(password, artist.Password_Hash);
    if (!match) return res.status(401).json({ message: "Incorrect password." });
    const token = jwt.sign(
      { loginId: artist.Login_ID, artistId: artist.Artist_ID, name: artist.Artist_Name, email: artist.Artist_Email },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ token, artistName: artist.Artist_Name });
  } catch (err) {
    res.status(500).json({ message: "Login failed.", error: err.message });
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


// ADMIN -- approve a registration
app.post("/api/admin/approve/:id", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.JWT_SECRET)
    return res.status(403).json({ message: "Not authorized." });
  try {
    const pool    = await getPool();
    const staging = await pool.request()
      .input("ID", sql.Int, req.params.id)
      .query("SELECT * FROM Artist_Registration_Staging WHERE Staging_ID = @ID AND Status = 'Pending'");

    if (staging.recordset.length === 0)
      return res.status(404).json({ message: "Record not found or already processed." });

    const rec = staging.recordset[0];

    // Insert into Artists table with all registration fields
    const artistInsert = await pool.request()
      .input("Name",      sql.NVarChar, rec.Artist_Name)
      .input("Email",     sql.NVarChar, rec.Artist_Email)
      .input("Phone",     sql.NVarChar, rec.Artist_Phone)
      .input("City",      sql.NVarChar, rec.Artist_City)
      .input("State",     sql.NVarChar, rec.Artist_State)
      .input("Instagram", sql.NVarChar, rec.Instagram_URL)
      .input("TikTok",    sql.NVarChar, rec.TikTok_URL)
      .input("Spotify",   sql.NVarChar, rec.Spotify_URL)
      .input("Apple",     sql.NVarChar, rec.Apple_URL)
      .input("YouTube",   sql.NVarChar, rec.YouTube_URL)
      .query(`INSERT INTO Artists
        (Artist_Name, Artist_Email, Artist_Phone_Number,
         Artist_City, Artist_State,
         Artist_Instagram_URL, Artist_TikTok_URL,
         Artist_Spotify_URL, Artist_Apple_URL, Artist_Youtube_URL)
        VALUES
        (@Name, @Email, @Phone, @City, @State,
         @Instagram, @TikTok, @Spotify, @Apple, @YouTube);
        SELECT SCOPE_IDENTITY() AS Artist_ID;`);

    const newArtistId = artistInsert.recordset[0].Artist_ID;

    // Create login linked to new Artist_ID
    await pool.request()
      .input("Name",     sql.NVarChar, rec.Artist_Name)
      .input("Email",    sql.NVarChar, rec.Artist_Email)
      .input("Hash",     sql.NVarChar, rec.Password_Hash)
      .input("ArtistID", sql.Int,      newArtistId)
      .query(`INSERT INTO ArtistLogins
        (Artist_Name, Artist_Email, Password_Hash, Artist_ID)
        VALUES (@Name, @Email, @Hash, @ArtistID)`);

// Mark staging as approved
    await pool.request()
      .input("ID", sql.Int, req.params.id)
      .query("UPDATE Artist_Registration_Staging SET Status = 'Approved' WHERE Staging_ID = @ID");

    res.json({ message: "Artist approved -- login and Artists record created." });
  } catch (err) { 
    console.error("APPROVE ERROR:", err.message);
    res.status(500).json({ message: "Approval failed.", error: err.message }); 
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

app.listen(PORT, () => console.log("Server running on port " + PORT));
