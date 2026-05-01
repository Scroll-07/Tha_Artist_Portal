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
  const { artistName, email, password } = req.body;
  if (!artistName || !email || !password)
    return res.status(400).json({ message: "All fields are required." });
  try {
    const pool = await getPool();
    // Check if email already in staging or approved logins
    const dupCheck = await pool.request()
      .input("Email", sql.NVarChar, email)
      .query(`SELECT 1 FROM ArtistLogins WHERE Artist_Email = @Email`,);
    if (dupCheck.recordset.length > 0)
      return res.status(409).json({ message: "An account with this email already exists." });
    const pendingCheck = await pool.request()
      .input("Email2", sql.NVarChar, email)
      .query("SELECT 1 FROM Artist_Registration_Staging WHERE Artist_Email = @Email2 AND Status = 'Pending'");
    if (pendingCheck.recordset.length > 0)
      return res.status(409).json({ message: "A registration for this email is already pending review." });
    const hash = await bcrypt.hash(password, 12);
    await pool.request()
      .input("Name",  sql.NVarChar, artistName)
      .input("Email", sql.NVarChar, email)
      .input("Hash",  sql.NVarChar, hash)
      .query("INSERT INTO Artist_Registration_Staging (Artist_Name, Artist_Email, Password_Hash) VALUES (@Name, @Email, @Hash)");
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
    // Link to Artists table if email matches
    const artistMatch = await pool.request()
      .input("Email", sql.NVarChar, rec.Artist_Email)
      .query("SELECT Artist_ID FROM Artists WHERE Artist_Email = @Email");
    const artistId = artistMatch.recordset.length > 0 ? artistMatch.recordset[0].Artist_ID : null;
    await pool.request()
      .input("Name",     sql.NVarChar, rec.Artist_Name)
      .input("Email",    sql.NVarChar, rec.Artist_Email)
      .input("Hash",     sql.NVarChar, rec.Password_Hash)
      .input("ArtistID", sql.Int,      artistId)
      .query("INSERT INTO ArtistLogins (Artist_Name, Artist_Email, Password_Hash, Artist_ID) VALUES (@Name, @Email, @Hash, @ArtistID)");
    await pool.request()
      .input("ID", sql.Int, req.params.id)
      .query("UPDATE Artist_Registration_Staging SET Status = 'Approved' WHERE Staging_ID = @ID");
    res.json({ message: "Artist approved and login created." });
  } catch (err) { res.status(500).json({ message: "Approval failed.", error: err.message }); }
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


app.listen(PORT, () => console.log("Server running on port " + PORT));
