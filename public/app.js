// ── Tab switching on login page ─────────────────────────────────
function showTab(tab) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  document.getElementById(tab).classList.add("active");
  document.querySelector('[onclick="showTab(\'' + tab + '\')"]').classList.add("active");
}



// ── Register ────────────────────────────────────────────────────
async function registerArtist() {
  const name  = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const pass  = document.getElementById("regPass").value;
  const msg   = document.getElementById("regMsg");

  if (!name || !email || !pass) {
    msg.style.color = "#f44336";
    msg.textContent = "Name, email and password are required.";
    return;
  }

  const payload = {
    artistName:   name,
    email:        email,
    password:     pass,
    phone:        document.getElementById("regPhone").value.trim(),
    city:         document.getElementById("regCity").value.trim(),
    state:        document.getElementById("regState").value.trim(),
    genre:        document.getElementById("regGenre").value.trim(),
    instagram:    document.getElementById("regInstagram").value.trim(),
    tiktok:       document.getElementById("regTikTok").value.trim(),
    spotify:      document.getElementById("regSpotify").value.trim(),
    apple:        document.getElementById("regApple").value.trim(),
    youtube:      document.getElementById("regYouTube").value.trim()
  };

  try {
    const res  = await fetch("/api/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });
    const data = await res.json();
    msg.style.color = res.ok ? "#4CAF50" : "#f44336";
    msg.textContent = data.message;
  } catch {
    msg.textContent = "Something went wrong. Try again.";
  }
}


// ── Login ────────────────────────────────────────────────────────
async function loginArtist() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass  = document.getElementById("loginPass").value;
  const msg   = document.getElementById("loginMsg");
  try {
    const res  = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.message; return; }
    localStorage.setItem("artistToken", data.token);
    localStorage.setItem("artistName",  data.artistName);
    window.location.href = "dashboard.html";
  } catch { msg.textContent = "Login failed. Try again."; }
}


// ── Logout ──────────────────────────────────────────────────────
function logout() {
  localStorage.removeItem("artistToken");
  localStorage.removeItem("artistName");
  window.location.href = "index.html";
}


// ── Load dashboard data ─────────────────────────────────────────
async function loadDashboard() {
  const token = localStorage.getItem("artistToken");
  const name  = localStorage.getItem("artistName");
  if (!token) { window.location.href = "index.html"; return; }
  document.getElementById("welcomeMsg").textContent = "Welcome back, " + name;
  const headers = { "Authorization": token };
  const [streams, royalties, songs, contracts] = await Promise.all([
    fetch("/api/streams",   { headers }).then(r => r.json()),
    fetch("/api/royalties", { headers }).then(r => r.json()),
    fetch("/api/songs",     { headers }).then(r => r.json()),
    fetch("/api/contracts", { headers }).then(r => r.json())
  ]);
  renderStreams(streams);
  renderRoyalties(royalties);
  renderSongs(songs);
  renderContracts(contracts);
}


function renderStreams(data) {
  const el = document.getElementById("streamsContainer");
  if (!data.length) { el.innerHTML = "<p class=no-data>No stream data yet.</p>"; return; }
  el.innerHTML = data.map(s =>
    "<div class=stat-card><div class=platform>" + s.Streaming_Platform + "</div>" +
    "<div class=stream-count>" + Number(s.Total_Streams).toLocaleString() + "</div>" +
    "<div class=stream-label>Total Streams</div></div>"
  ).join("");
}


function renderRoyalties(data) {
  const tb = document.getElementById("royaltiesBody");
  if (!data.length) { tb.innerHTML = "<tr><td colspan=5 class=no-data>No royalty records yet.</td></tr>"; return; }
  tb.innerHTML = data.map(r =>
    "<tr><td>" + (r.Streaming_Platform||"-") + "</td><td>" + (r.Label_Name||"-") + "</td>" +
    "<td class=amount>$" + Number(r.Amount||0).toFixed(2) + "</td>" +
    "<td>" + (r.Payment_Date ? new Date(r.Payment_Date).toLocaleDateString() : "-") + "</td>" +
    "<td><span class=status-" + (r.Status_On_Royaltiy||"").toLowerCase().replace(/ /g,"-") + ">" + (r.Status_On_Royaltiy||"-") + "</span></td></tr>"
  ).join("");
}


function renderSongs(data) {
  const tb = document.getElementById("songsBody");
  if (!data.length) {
    tb.innerHTML = "<tr><td colspan=6 class=no-data>No songs yet. Add your first song below!</td></tr>";
    return;
  }
  tb.innerHTML = data.map(s =>
    "<tr>" +
    "<td>" + (s.Song_Name||"-") + "</td>" +
    "<td>" + (s.Album||"-") + "</td>" +
    "<td>" + (s.Release_Date ? new Date(s.Release_Date).toLocaleDateString() : "-") + "</td>" +
    "<td>" + (s.Duration_of_Song||"-") + "</td>" +
    "<td>" + (s.ISRC||"-") + "</td>" +
    "<td>" +
    "<button class='edit-btn' onclick='editSong(" +
      s.Song_ID + ",\"" + (s.Song_Name||"") + "\",\"" + (s.Album||"") + "\"," +
      "\"" + (s.Release_Date||"") + "\",\"" + (s.Duration_of_Song||"") + "\"," +
      "\"" + (s.ISRC||"") + "\",\"" + (s.Featured_Artist||"") + "\"," +
      "\"" + (s.Writers_Credit||"") + "\",\"" + (s.Producer_Name||"") + "\"" +
    ")'>Edit</button> " +
    "<button class='delete-btn' onclick='deleteSong(" + s.Song_ID + ")'>Delete</button>" +
    "</td></tr>"
  ).join("");
}


function renderContracts(data) {
  const el = document.getElementById("contractsContainer");
  if (!data.length) { el.innerHTML = "<p class=no-data>No contracts on file.</p>"; return; }
  el.innerHTML = data.map(c =>
    "<div class=contract-card>" +
    "<div class=contract-label>" + (c.Label_Name||"Unknown Label") + "</div>" +
    "<div class=contract-deal>" + (c.Deal_Type||"-") + "</div>" +
    "<div class=contract-splits>" +
    "Artist: " + (c.Ownership_Percent_Artist||0) + "%  |  " +
    "Manager: " + (c.Ownership_Percent_Manager||0) + "%  |  " +
    "Label: " + (c.Ownership_Percent_Label||0) + "%" +
    "</div>" +
    "<div class=contract-dates>" +
    (c.Contract_Start_Date ? new Date(c.Contract_Start_Date).toLocaleDateString() : "?") + " to " +
    (c.Contract_End_Date   ? new Date(c.Contract_End_Date).toLocaleDateString()   : "?") +
    "</div></div>"
  ).join("");
}

// ── Profile Modal ────────────────────────────────────────────────
async function openProfileModal() {
  // Load current data into fields
  const token = localStorage.getItem("artistToken");
  try {
    const res  = await fetch("/api/profile", {
      headers: { "Authorization": token }
    });
    const data = await res.json();
    document.getElementById("updName").value      = data.Artist_Name      || "";
    document.getElementById("updEmail").value     = data.Artist_Email     || "";
    document.getElementById("updPhone").value     = data.Artist_Phone_Number || "";
    document.getElementById("updCity").value      = data.Artist_City      || "";
    document.getElementById("updState").value     = data.Artist_State     || "";
    document.getElementById("updGenre").value     = data.Genre            || "";
    document.getElementById("updInstagram").value = data.Artist_Instagram_URL || "";
    document.getElementById("updTikTok").value    = data.Artist_TikTok_URL    || "";
    document.getElementById("updSpotify").value   = data.Artist_Spotify_URL   || "";
    document.getElementById("updApple").value     = data.Artist_Apple_URL     || "";
    document.getElementById("updYouTube").value   = data.Artist_Youtube_URL   || "";
  } catch { }
  document.getElementById("profileModal").classList.add("active");
}

function closeProfileModal() {
  document.getElementById("profileModal").classList.remove("active");
  document.getElementById("updMsg").textContent = "";
}

async function saveProfile() {
  const token = localStorage.getItem("artistToken");
  const msg   = document.getElementById("updMsg");
  const payload = {
    artistName: document.getElementById("updName").value.trim(),
    email:      document.getElementById("updEmail").value.trim(),
    phone:      document.getElementById("updPhone").value.trim(),
    city:       document.getElementById("updCity").value.trim(),
    state:      document.getElementById("updState").value.trim(),
    genre:      document.getElementById("updGenre").value.trim(),
    instagram:  document.getElementById("updInstagram").value.trim(),
    tiktok:     document.getElementById("updTikTok").value.trim(),
    spotify:    document.getElementById("updSpotify").value.trim(),
    apple:      document.getElementById("updApple").value.trim(),
    youtube:    document.getElementById("updYouTube").value.trim()
  };
  try {
    const res  = await fetch("/api/profile", {
      method:  "PUT",
      headers: { "Authorization": token, "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });
    const data = await res.json();
    msg.style.color = res.ok ? "#4CAF50" : "#f44336";
    msg.textContent = data.message;
    if (res.ok) {
      localStorage.setItem("artistName", payload.artistName);
      document.getElementById("welcomeMsg").textContent = "Welcome back, " + payload.artistName;
      setTimeout(closeProfileModal, 1500);
    }
  } catch {
    msg.textContent = "Something went wrong. Try again.";
  }
}

// ── Song Section ─────────────────────────────────────────────────
function toggleSongForm() {
  const section = document.getElementById("addSongSection");
  section.style.display = section.style.display === "none" ? "block" : "none";
}

function clearSongForm() {
  ["newSongName","newAlbum","newReleaseDate","newDuration",
   "newISRC","newFeatured","newWriters","newProducer"]
  .forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("editingSongId").value = "";
  document.getElementById("songFormTitle").textContent = "Add New Song";
  document.getElementById("songSubmitBtn").textContent = "Add Song";
}

function editSong(id, name, album, releaseDate, duration,
                  isrc, featured, writers, producer) {
  document.getElementById("editingSongId").value  = id;
  document.getElementById("newSongName").value    = name      || "";
  document.getElementById("newAlbum").value       = album     || "";
  document.getElementById("newReleaseDate").value = releaseDate ? releaseDate.split("T")[0] : "";
  document.getElementById("newDuration").value    = duration  || "";
  document.getElementById("newISRC").value        = isrc      || "";
  document.getElementById("newFeatured").value    = featured  || "";
  document.getElementById("newWriters").value     = writers   || "";
  document.getElementById("newProducer").value    = producer  || "";
  document.getElementById("songFormTitle").textContent  = "Edit Song";
  document.getElementById("songSubmitBtn").textContent  = "Save Changes";
  document.getElementById("addSongSection").style.display = "block";
  document.getElementById("addSongSection").scrollIntoView({ behavior: "smooth" });
}

async function submitSong() {
  const token    = localStorage.getItem("artistToken");
  const editingId = document.getElementById("editingSongId").value;
  const msg      = document.getElementById("songMsg");
  const payload  = {
    songName:      document.getElementById("newSongName").value.trim(),
    album:         document.getElementById("newAlbum").value.trim(),
    releaseDate:   document.getElementById("newReleaseDate").value,
    duration:      document.getElementById("newDuration").value.trim(),
    isrc:          document.getElementById("newISRC").value.trim(),
    featuredArtist:document.getElementById("newFeatured").value.trim(),
    writersCredit: document.getElementById("newWriters").value.trim(),
    producerName:  document.getElementById("newProducer").value.trim()
  };
  if (!payload.songName) {
    msg.style.color = "#f44336";
    msg.textContent = "Song name is required.";
    return;
  }
  try {
    const url    = editingId ? "/api/songs/" + editingId : "/api/songs";
    const method = editingId ? "PUT" : "POST";
    const res    = await fetch(url, {
      method,
      headers: { "Authorization": token, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    msg.style.color = res.ok ? "#4CAF50" : "#f44336";
    msg.textContent = data.message;
    if (res.ok) {
      clearSongForm();
      loadDashboard();
    }
  } catch {
    msg.textContent = "Something went wrong. Try again.";
  }
}

async function deleteSong(id) {
  if (!confirm("Delete this song? This cannot be undone.")) return;
  const token = localStorage.getItem("artistToken");
  const res   = await fetch("/api/songs/" + id, {
    method: "DELETE",
    headers: { "Authorization": token }
  });
  const data = await res.json();
  alert(data.message);
  loadDashboard();
}


// Auto-run when on dashboard page
if (document.getElementById("welcomeMsg")) loadDashboard();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('TAP service worker registered'))
      .catch(err => console.log('SW error:', err));
  });
}
