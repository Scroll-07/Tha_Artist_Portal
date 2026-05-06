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
  const [streams, royalties, songs, contracts, social] = await Promise.all([
    fetch("/api/streams",   { headers }).then(r => r.json()),
    fetch("/api/royalties", { headers }).then(r => r.json()),
    fetch("/api/songs",     { headers }).then(r => r.json()),
    fetch("/api/contracts", { headers }).then(r => r.json()),
    fetch("/api/social",    { headers }).then(r => r.json())
  ]);
  renderStreams(streams);
  renderRoyalties(royalties);
  renderSongs(songs);
  renderContracts(contracts);
  renderSocial(social);
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

function renderSocial(data) {
  const el = document.getElementById("socialContainer");
  if (!data) { el.innerHTML = "<p class=no-data>No platform links added yet.</p>"; return; }

  const platforms = [
    {
      name:  "Spotify",
      url:   data.Artist_Spotify_URL,
      color: "#1DB954",
      icon:  "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
    },
    {
      name:  "Apple Music",
      url:   data.Artist_Apple_URL,
      color: "#FC3C44",
      icon:  "M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208A4.98 4.98 0 00.05 4.783c-.01.154-.017.308-.026.462v13.55c.01.155.018.31.027.465.05.848.197 1.674.544 2.45.717 1.616 1.975 2.641 3.69 3.066a8.98 8.98 0 001.979.24c.908.027 1.817.023 2.725.023h8.476c.91 0 1.82.004 2.728-.023a8.382 8.382 0 002.206-.4c1.536-.535 2.585-1.538 3.163-3.051.273-.713.41-1.457.45-2.218.012-.2.02-.4.024-.6V6.66c-.005-.178-.013-.356-.022-.535zm-6.76 8.24c0 .402-.01.804-.033 1.204-.032.557-.17 1.09-.507 1.55-.443.603-1.045.94-1.78.99-.496.033-.977-.073-1.43-.283-.63-.293-1.107-.764-1.476-1.355-.48-.77-.718-1.617-.787-2.51a7.37 7.37 0 01-.02-.6V6.7c0-.56.28-.924.82-1.036a.958.958 0 01.195-.02c.59 0 .985.39.985.98v4.97c0 .102.003.204.012.305.04.452.18.872.45 1.24.363.494.858.757 1.47.746.594-.01 1.07-.28 1.41-.76.267-.377.387-.805.413-1.258.01-.18.01-.36.01-.54V6.69c0-.56.28-.924.82-1.036a.958.958 0 01.195-.02c.59 0 .984.39.984.98v8.73z"
    },
    {
      name:  "Instagram",
      url:   data.Artist_Instagram_URL,
      color: "#E1306C",
      icon:  "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"
    },
    {
      name:  "TikTok",
      url:   data.Artist_TikTok_URL,
      color: "#69C9D0",
      icon:  "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
    },
    {
      name:  "YouTube",
      url:   data.Artist_Youtube_URL,
      color: "#FF0000",
      icon:  "M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"
    }
  ];

  const links = platforms.filter(p => p.url && p.url.trim() !== "");

  if (!links.length) {
    el.innerHTML = "<p class=no-data>No platform links added yet. Update your profile to add them.</p>";
    return;
  }

  el.innerHTML = links.map(p =>
    "<a href='" + p.url + "' target='_blank' rel='noopener noreferrer' class='social-card'>" +
    "<div class='social-icon-wrap' style='background:" + p.color + "22; border:1.5px solid " + p.color + "'>" +
    "<svg viewBox='0 0 24 24' fill='" + p.color + "' width='28' height='28'>" +
    "<path d='" + p.icon + "'/></svg></div>" +
    "<div class='social-name'>" + p.name + "</div>" +
    "<div class='social-arrow'>→</div>" +
    "</a>"
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
