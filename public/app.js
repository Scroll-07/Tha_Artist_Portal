/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */

// ── Tab switching on login page ─────────────────────────────────
function showTab(tab) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  document.getElementById(tab).classList.add("active");
  document.querySelector('[onclick="showTab(\'' + tab + '\')"]').classList.add("active");
}

// ── Role specific fields ─────────────────────────────────────────
function updateRoleFields() {
  const role = document.getElementById('regRole').value;
  const container = document.getElementById('roleSpecificFields');

  const fieldSets = {
    'Artist': `
      <p class='section-divider'>Artist Details</p>
      <input type='text' id='regGenre'    placeholder='Primary Genre (e.g. Hip Hop, R&B, Pop)'>
      <input type='text' id='regAscap'    placeholder='ASCAP / BMI / PRO ID (optional)'>
      <input type='text' id='regLabel'    placeholder='Record Label (if signed)'>
      <input type='text' id='regManagerId' placeholder='Manager TAP ID (optional)'>`,

    'Manager': `
      <p class='section-divider'>Manager Details</p>
      <input type='text' id='regLabel'    placeholder='Label or Company Name'>
      <input type='text' id='regRoster'   placeholder='Number of Artists on Roster'>`,

    'Producer': `
      <p class='section-divider'>Producer Details</p>
      <input type='text' id='regGenre'      placeholder='Genre Specialty (e.g. Trap, R&B, Pop)'>
      <input type='text' id='regDaw'        placeholder='DAW Software (e.g. FL Studio, Logic Pro)'>
      <input type='text' id='regYearsExp'   placeholder='Years of Experience'>`,

    'Engineer': `
      <p class='section-divider'>Engineer Details</p>
      <input type='text' id='regEngType'    placeholder='Speciality (Mixing, Mastering, Recording, Live)'>
      <input type='text' id='regStudio'     placeholder='Studio Name (if applicable)'>
      <input type='text' id='regDaw'        placeholder='DAW Software'>
      <input type='text' id='regYearsExp'   placeholder='Years of Experience'>`,

    'Record Label': `
      <p class='section-divider'>Label Details</p>
      <input type='text' id='regLabel'      placeholder='Label Name'>
      <input type='text' id='regLabelOwner' placeholder='Label Owner Name'>
      <input type='text' id='regRoster'     placeholder='Number of Artists on Roster'>`,

    'Painter': `
      <p class='section-divider'>Artist Details</p>
      <input type='text' id='regSubField'   placeholder='Art Style (e.g. Abstract, Realism, Digital)'>`,

    'Photographer': `
      <p class='section-divider'>Photographer Details</p>
      <input type='text' id='regSubField'   placeholder='Specialty (e.g. Portrait, Concert, Commercial)'>`,

    'Filmmaker': `
      <p class='section-divider'>Filmmaker Details</p>
      <input type='text' id='regSubField'   placeholder='Specialty (e.g. Music Videos, Short Films, Docs)'>`,

    'Fashion Designer': `
      <p class='section-divider'>Fashion Details</p>
      <input type='text' id='regSubField'   placeholder='Specialty (e.g. Streetwear, Luxury, Accessories)'>`,

    'Dancer': `
      <p class='section-divider'>Dancer Details</p>
      <input type='text' id='regSubField'   placeholder='Dance Style (e.g. Hip Hop, Contemporary, Ballet)'>`,

    'Graphic Designer': `
      <p class='section-divider'>Design Details</p>
      <input type='text' id='regSubField'   placeholder='Specialty (e.g. Branding, Motion, Print)'>`,

    'Videographer': `
      <p class='section-divider'>Videographer Details</p>
      <input type='text' id='regSubField'   placeholder='Specialty (e.g. Events, Commercial, Content)'>`,

    'Actor': `
      <p class='section-divider'>Acting Details</p>
      <input type='text' id='regSubField'   placeholder='Type (e.g. Film, TV, Stage, Voice)'>`,

    'Stylist': `
      <p class='section-divider'>Stylist Details</p>
      <input type='text' id='regSubField'   placeholder='Specialty (e.g. Editorial, Celebrity, Personal)'>`,
  };

  const html = fieldSets[role] || `
    <p class='section-divider'>Creative Details</p>
    <input type='text' id='regSubField' placeholder='Describe your creative field'>`;

  container.innerHTML = `<div class='register-grid' style='margin-top:0'>${html}</div>`;
}

// ── Register ────────────────────────────────────────────────────
async function registerArtist() {
  const role  = document.getElementById('regRole').value.trim();
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPass').value;
  const msg   = document.getElementById('regMsg');

  if (!role || !name || !email || !pass) {
    msg.style.color = '#f44336';
    msg.textContent = 'Role, name, email and password are required.';
    return;
  }

  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

  const payload = {
    role,
    name,
    email,
    password:     pass,
    phone:        val('regPhone'),
    city:         val('regCity'),
    state:        val('regState'),
    country:      val('regCountry'),
    tapIdLink:    val('regTapIdLink'),
    instagram:    val('regInstagram'),
    tiktok:       val('regTikTok'),
    spotify:      val('regSpotify'),
    apple:        val('regApple'),
    youtube:      val('regYouTube'),
    website:      val('regWebsite'),
    bio:          val('regBio'),
    genre:        val('regGenre'),
    ascapId:      val('regAscap'),
    labelName:    val('regLabel'),
    dawSoftware:  val('regDaw'),
    engineerType: val('regEngType'),
    studioName:   val('regStudio'),
    yearsExp:     val('regYearsExp'),
    subField:     val('regSubField'),
  };

  try {
    const res  = await fetch('/api/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
    const data = await res.json();
    msg.style.color = res.ok ? '#4CAF50' : '#f44336';
    msg.textContent = data.message;
  } catch {
    msg.textContent = 'Something went wrong. Try again.';
  }
}

// ── Login ────────────────────────────────────────────────────────
async function loginArtist() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const msg   = document.getElementById('loginMsg');
  try {
    const res  = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.message; return; }
    localStorage.setItem('artistToken', data.token);
    localStorage.setItem('artistName', data.name);
    localStorage.setItem('artistRole',  data.role);
    localStorage.setItem('artistTapId', data.tapId || '');
    setTimeout(() => subscribeToPush(data.token), 2000);
    window.location.href = 'dashboard.html';
  } catch { msg.textContent = 'Login failed. Try again.'; }
}

// ── Logout ──────────────────────────────────────────────────────
function logout() {
  localStorage.removeItem("artistToken");
  localStorage.removeItem("artistName");
  localStorage.removeItem("artistRole");
  localStorage.removeItem("artistTapId");
  window.location.href = "index.html";
}

// ── Load dashboard data ─────────────────────────────────────────
async function loadDashboard() {
  const token = localStorage.getItem('artistToken');
  const name  = localStorage.getItem('artistName');
  const role  = localStorage.getItem('artistRole') || 'Artist';
  const tapId = localStorage.getItem('artistTapId') || '';
  if (!token) { window.location.href = 'index.html'; return; }
  document.getElementById('welcomeMsg').textContent = 'Welcome back, ' + name;
  const roleBadge = document.getElementById('roleBadge');
  const tapIdEl   = document.getElementById('tapIdDisplay');
  if (roleBadge) roleBadge.textContent = role;
  if (tapIdEl)   tapIdEl.textContent   = tapId ? 'Your TAP ID: ' + tapId : '';
  const headers = { 'Authorization': token };
  const [streams, royalties, songs, contracts, social] = await Promise.all([
    fetch('/api/streams',   { headers }).then(r => r.json()),
    fetch('/api/royalties', { headers }).then(r => r.json()),
    fetch('/api/songs',     { headers }).then(r => r.json()),
    fetch('/api/contracts', { headers }).then(r => r.json()),
    fetch('/api/social',    { headers }).then(r => r.json())
  ]);
  renderStreams(streams);
  renderRoyalties(royalties);
  renderSongs(songs);
  renderContracts(contracts);
  renderSocial(social);
  loadCollabRequests();
  loadNotificationCount();
  showLoginNotifPopup();
  loadSpotifyData();
  
}

// ── Render functions ─────────────────────────────────────────────
function renderStreams(data) {
  const el = document.getElementById("streamsContainer");
  if (!data.length) { el.innerHTML = "<p class=no-data>No stream data yet.</p>"; return; }
  el.innerHTML = data.map(s =>
    "<div class=stat-card><div class=platform>" + s.Streaming_Platform + "</div>" +
    "<div class=stream-count>" + Number(s.Stream_Count).toLocaleString() + "</div>" +
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
  if (!el) return;
  const d = Array.isArray(data) ? data[0] : data;
  if (!d) {
    el.innerHTML = "<p class=no-data>No platform links added yet. Update your profile to add them.</p>";
    return;
  }
  const platforms = [
    { name: "Spotify",     url: d.Artist_Spotify_URL,   color: "#1DB954", icon: "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" },
    { name: "Apple Music", url: d.Artist_Apple_URL,     color: "#FC3C44", icon: "M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208A4.98 4.98 0 00.05 4.783c-.01.154-.017.308-.026.462v13.55c.01.155.018.31.027.465.05.848.197 1.674.544 2.45.717 1.616 1.975 2.641 3.69 3.066a8.98 8.98 0 001.979.24c.908.027 1.817.023 2.725.023h8.476c.91 0 1.82.004 2.728-.023a8.382 8.382 0 002.206-.4c1.536-.535 2.585-1.538 3.163-3.051.273-.713.41-1.457.45-2.218.012-.2.02-.4.024-.6V6.66c-.005-.178-.013-.356-.022-.535zm-6.76 8.24c0 .402-.01.804-.033 1.204-.032.557-.17 1.09-.507 1.55-.443.603-1.045.94-1.78.99-.496.033-.977-.073-1.43-.283-.63-.293-1.107-.764-1.476-1.355-.48-.77-.718-1.617-.787-2.51a7.37 7.37 0 01-.02-.6V6.7c0-.56.28-.924.82-1.036a.958.958 0 01.195-.02c.59 0 .985.39.985.98v4.97c0 .102.003.204.012.305.04.452.18.872.45 1.24.363.494.858.757 1.47.746.594-.01 1.07-.28 1.41-.76.267-.377.387-.805.413-1.258.01-.18.01-.36.01-.54V6.69c0-.56.28-.924.82-1.036a.958.958 0 01.195-.02c.59 0 .984.39.984.98v8.73z" },
    { name: "Instagram",   url: d.Artist_Instagram_URL, color: "#E1306C", icon: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" },
    { name: "TikTok",      url: d.Artist_TikTok_URL,    color: "#69C9D0", icon: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" },
    { name: "YouTube",     url: d.Artist_Youtube_URL,   color: "#FF0000", icon: "M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" }
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
    "<div class='social-arrow'>&#8594;</div>" +
    "</a>"
  ).join("");
}

// ── Discover Page ────────────────────────────────────────────────
async function searchCreatives() {
  const token = localStorage.getItem('artistToken');
  if (!token) { window.location.href = 'index.html'; return; }
  const name     = document.getElementById('searchName').value.trim();
  const role     = document.getElementById('searchRole').value;
  const city     = document.getElementById('searchCity').value.trim();
  const state    = document.getElementById('searchState').value.trim();
  const platform = document.getElementById('searchPlatform').value;
  const params   = new URLSearchParams();
  if (name)     params.append('name',     name);
  if (role)     params.append('role',     role);
  if (city)     params.append('city',     city);
  if (state)    params.append('state',    state);
  if (platform) params.append('platform', platform);
  try {
    const res  = await fetch('/api/discover?' + params.toString(), {
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    renderProfiles(data);
  } catch {
    document.getElementById('profileGrid').innerHTML =
      '<p class=no-results>Something went wrong. Try again.</p>';
  }
}

function clearSearch() {
  ['searchName','searchCity','searchState'].forEach(id => {
    document.getElementById(id).value = '';
  });
  ['searchRole','searchPlatform'].forEach(id => {
    document.getElementById(id).selectedIndex = 0;
  });
  document.getElementById('profileGrid').innerHTML = '';
  document.getElementById('resultCount').textContent = '';
}

function renderProfiles(data) {
  const grid  = document.getElementById('profileGrid');
  const count = document.getElementById('resultCount');
  if (!data.length) {
    grid.innerHTML    = '<p class=no-results>No creatives found. Try a different search.</p>';
    count.textContent = '';
    return;
  }
  count.textContent = data.length + ' creative' + (data.length !== 1 ? 's' : '') + ' found';
  grid.innerHTML = data.map(p => {
    const initials = (p.Artist_Name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    const location = [p.Artist_City, p.Artist_State].filter(Boolean).join(', ') || 'Location not set';
    const socials = [
      { url: p.Artist_Spotify_URL,   bg: '#1DB954', label: 'SP' },
      { url: p.Artist_Instagram_URL, bg: '#E1306C', label: 'IG' },
      { url: p.Artist_TikTok_URL,    bg: '#69C9D0', label: 'TT' },
      { url: p.Artist_Youtube_URL,   bg: '#FF0000', label: 'YT' },
      { url: p.Artist_Apple_URL,     bg: '#FC3C44', label: 'AM' }
    ].filter(s => s.url && s.url.trim() !== '');
    return '<div class=profile-card onclick="openProfile(' + p.Login_ID + ')">' +
      '<div class=profile-avatar>' + initials + '</div>' +
      '<div class=profile-name>' + (p.Artist_Name || 'Unknown') + '</div>' +
      '<span class=profile-role>' + (p.Role || 'Creative') + '</span><br>' +
      '<div class=profile-location>&#128205; ' + location + '</div>' +
      '<div class=profile-tap>' + (p.TAP_ID || '') + '</div>' +
      '<div class=profile-socials>' +
      socials.map(s =>
        '<a href="' + s.url + '" target="_blank" rel="noopener"' +
        ' class=social-dot style="background:' + s.bg + '"' +
        ' onclick="event.stopPropagation()">' + s.label + '</a>'
      ).join('') + '</div>' +
      '<button class=view-profile-btn onclick="event.stopPropagation(); openProfile(' + p.Login_ID + ')">View Profile + Connect</button>' +
      '</div>';
  }).join('');
}

async function openProfile(loginId) {
  const token = localStorage.getItem('artistToken');
  try {
    const res = await fetch('/api/discover/' + loginId, {
      headers: { 'Authorization': token }
    });
    const p = await res.json();
    const initials = (p.Artist_Name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    const location = [p.Artist_City, p.Artist_State, p.Artist_Country].filter(Boolean).join(', ') || 'Not set';
    const socialLinks = [
      { url: p.Artist_Spotify_URL,   color: '#1DB954', name: 'Spotify' },
      { url: p.Artist_Instagram_URL, color: '#E1306C', name: 'Instagram' },
      { url: p.Artist_TikTok_URL,    color: '#69C9D0', name: 'TikTok' },
      { url: p.Artist_Youtube_URL,   color: '#FF0000', name: 'YouTube' },
      { url: p.Artist_Apple_URL,     color: '#FC3C44', name: 'Apple Music' }
    ].filter(s => s.url && s.url.trim() !== '');
    document.getElementById('profileModalContent').innerHTML =
      '<div class=pm-avatar>' + initials + '</div>' +
      '<div class=pm-name>' + (p.Artist_Name || 'Unknown') + '</div>' +
      '<div class=pm-role><span class=profile-role>' + (p.Role || 'Creative') + '</span></div>' +
      '<div class=pm-detail><strong>TAP ID:</strong> <span style="font-family:monospace;color:#666">' + (p.TAP_ID || 'Not assigned') + '</span></div>' +
      '<div class=pm-detail><strong>Location:</strong> ' + location + '</div>' +
      (p.Signed_2_Label ? '<div class=pm-detail><strong>Label:</strong> ' + p.Signed_2_Label + '</div>' : '') +
      (p.Manager_Name   ? '<div class=pm-detail><strong>Manager:</strong> ' + p.Manager_Name + '</div>' : '') +
      '<div class=pm-socials>' +
      socialLinks.map(s =>
        '<a href="' + s.url + '" target="_blank" rel="noopener" class=pm-social-link' +
        ' style="background:' + s.color + '22; border:1px solid ' + s.color + '; color:' + s.color + '">' +
        s.name + ' &#8594;</a>'
      ).join('') + '</div>' +
      '<div class=collab-section>' +
      '<h3>Send a Collab Request</h3>' +
      '<textarea id=collabMessage class=collab-textarea' +
      ' placeholder="Introduce yourself and describe what you want to work on..."></textarea>' +
      '<button class=gold-btn onclick="sendCollabRequest(' + loginId + ')">' +
      'Send Request</button>' +
      '<p id=collabMsg style="margin-top:8px; font-size:0.85rem;"></p>' +
      '</div>';
    document.getElementById('profileModal').classList.add('active');
  } catch {
    alert('Could not load profile. Try again.');
  }
}

async function sendCollabRequest(receiverLoginId) {
  const token   = localStorage.getItem('artistToken');
  const message = document.getElementById('collabMessage').value.trim();
  const msg     = document.getElementById('collabMsg');
  if (!message) {
    msg.style.color = '#f44336';
    msg.textContent = 'Please write a message before sending.';
    return;
  }
  try {
    const res  = await fetch('/api/collab-request', {
      method:  'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ receiverLoginId, message })
    });
    const data = await res.json();
    msg.style.color = res.ok ? '#4CAF50' : '#f44336';
    msg.textContent = data.message;
  } catch {
    msg.textContent = 'Something went wrong. Try again.';
  }
}

// Auto load on discover page
if (document.getElementById('profileGrid')) {
  const token = localStorage.getItem('artistToken');
  if (!token) window.location.href = 'index.html';
  searchCreatives();
}

// ── Profile Modal ────────────────────────────────────────────────
async function openProfileModal() {
  const token = localStorage.getItem("artistToken");
  const role  = localStorage.getItem("artistRole") || "Artist";
  try {
    const res = await fetch("/api/profile", {
      headers: { "Authorization": token }
    });
    if (res.ok) {
      const data = await res.json();
      document.getElementById("updName").value      = data.Artist_Name          || "";
      document.getElementById("updEmail").value     = data.Artist_Email         || "";
      document.getElementById("updPhone").value     = data.Artist_Phone_Number  || "";
      document.getElementById("updCity").value      = data.Artist_City          || "";
      document.getElementById("updState").value     = data.Artist_State         || "";
      document.getElementById("updInstagram").value = data.Artist_Instagram_URL || "";
      document.getElementById("updTikTok").value    = data.Artist_TikTok_URL    || "";
      document.getElementById("updSpotify").value   = data.Artist_Spotify_URL   || "";
      document.getElementById("updApple").value     = data.Artist_Apple_URL     || "";
      document.getElementById("updYouTube").value   = data.Artist_Youtube_URL   || "";

      // Role-specific fields
      const fill = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
      fill("updGenre",    data.Genre_Specialty);
      fill("updSubField", data.Creative_SubField || data.Creative_Field);
      fill("updWebsite",  data.Website_URL);
      fill("updPortfolio",data.Portfolio_URL);
      fill("updDaw",      data.DAW_Software);
      fill("updBio",      data.Bio);

      // Change genre placeholder based on role
      const genrePlaceholders = {
        "Artist":          "Primary Genre (e.g. Hip Hop, R&B, Pop)",
        "Producer":        "Genre Specialty",
        "Engineer":        "Specialty (Mixing, Mastering, Recording, Live)",
        "Painter":         "Art Style (e.g. Abstract, Realism, Digital)",
        "Photographer":    "Photography Specialty (Portrait, Concert, Commercial)",
        "Graphic Designer":"Design Specialty (Branding, Motion, Print)",
        "Filmmaker":       "Film Specialty (Music Videos, Short Films, Docs)",
        "Dancer":          "Dance Style (Hip Hop, Contemporary, Ballet)",
        "Fashion Designer":"Fashion Specialty (Streetwear, Luxury, Accessories)",
        "Actor":           "Acting Type (Film, TV, Stage, Voice)",
        "Stylist":         "Styling Specialty (Editorial, Celebrity, Personal)",
        "Manager":         "Industry Focus",
        "Record Label":    "Label Genre Focus",
        "Videographer":    "Video Specialty (Events, Commercial, Content)",
        "Other":           "Your Creative Specialty"
      };
      const genreEl = document.getElementById("updGenre");
      if (genreEl) genreEl.placeholder = genrePlaceholders[role] || "Primary Genre";

      // Show DAW only for producers and engineers
      const dawEl = document.getElementById("updDaw");
      if (dawEl) dawEl.style.display = ["Producer","Engineer"].includes(role) ? "block" : "none";

      // Show portfolio only for visual and creative roles
      const portEl = document.getElementById("updPortfolio");
      if (portEl) portEl.style.display = !["Artist","Manager","Record Label"].includes(role) ? "block" : "none";

      // Show Spotify and Apple only for music roles
      const showMusic = ["Artist","Producer","Engineer","Manager","Record Label"].includes(role);
      const spotEl  = document.getElementById("updSpotify");
      const appleEl = document.getElementById("updApple");
      if (spotEl)  spotEl.closest ? spotEl.style.display  = showMusic ? "block" : "none" : null;
      if (appleEl) appleEl.closest ? appleEl.style.display = showMusic ? "block" : "none" : null;
    }
  } catch { }
  document.getElementById("profileModal").classList.add("active");
  loadNotifPreferences();
}

function closeProfileModal() {
  document.getElementById("profileModal").classList.remove("active");
  document.getElementById("updMsg").textContent = "";
}

async function saveProfile() {
  const token = localStorage.getItem("artistToken");
  const msg   = document.getElementById("updMsg");

  const payload = {};
  const fields = [
    { key: "artistName", id: "updName"      },
    { key: "email",      id: "updEmail"     },
    { key: "phone",      id: "updPhone"     },
    { key: "city",       id: "updCity"      },
    { key: "state",      id: "updState"     },
    { key: "genre",      id: "updGenre"     },
    { key: "instagram",  id: "updInstagram" },
    { key: "tiktok",     id: "updTikTok"    },
    { key: "spotify",    id: "updSpotify"   },
    { key: "apple",      id: "updApple"     },
    { key: "youtube",    id: "updYouTube"   },
    { key: "subField",   id: "updSubField"  },
    { key: "website",    id: "updWebsite"   },
    { key: "portfolio",  id: "updPortfolio" },
    { key: "daw",        id: "updDaw"       },
    { key: "bio",        id: "updBio"       }
  ];

  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if (el && el.value.trim()) payload[f.key] = el.value.trim();
  });

  if (Object.keys(payload).length === 0) {
    msg.style.color = "#f44336";
    msg.textContent = "Please fill in at least one field to update.";
    return;
  }

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
      if (payload.artistName) {
        localStorage.setItem("artistName", payload.artistName);
        document.getElementById("welcomeMsg").textContent = "Welcome back, " + payload.artistName;
      }
      saveNotifPreferences();
      setTimeout(() => {
        closeProfileModal();
        loadDashboard();
      }, 1500);
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
  const token     = localStorage.getItem("artistToken");
  const editingId = document.getElementById("editingSongId").value;
  const msg       = document.getElementById("songMsg");
  const payload   = {
    songName:       document.getElementById("newSongName").value.trim(),
    album:          document.getElementById("newAlbum").value.trim(),
    releaseDate:    document.getElementById("newReleaseDate").value,
    duration:       document.getElementById("newDuration").value.trim(),
    isrc:           document.getElementById("newISRC").value.trim(),
    featuredArtist: document.getElementById("newFeatured").value.trim(),
    writersCredit:  document.getElementById("newWriters").value.trim(),
    producerName:   document.getElementById("newProducer").value.trim()
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

// ── Collab Requests ──────────────────────────────────────────────
function showCollabTab(tab) {
  document.getElementById('collabReceived').style.display = tab === 'received' ? 'block' : 'none';
  document.getElementById('collabSent').style.display     = tab === 'sent'     ? 'block' : 'none';
}

async function loadCollabRequests() {
  const token = localStorage.getItem('artistToken');
  if (!token) return;
  try {
    const res  = await fetch('/api/collab-requests', {
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    renderCollabReceived(data.received || []);
    renderCollabSent(data.sent || []);
  } catch { }
}

function renderCollabReceived(data) {
  const el = document.getElementById('collabReceived');
  if (!el) return;
  if (!data.length) {
    el.innerHTML = '<p class=no-data>No collab requests received yet.</p>'; return;
  }
  el.innerHTML = data.map(r =>
    '<div style="background:#1a1a1a; border:1px solid #2a2a2a; border-left:4px solid ' +
    (r.Status === 'Accepted' ? '#2E7D32' : r.Status === 'Declined' ? '#B71C1C' : '#D4AF37') +
    '; border-radius:8px; padding:16px; margin-bottom:12px;">' +
    '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
    '<div>' +
    '<div style="color:#eee; font-weight:600;">' + r.Sender_Name + '</div>' +
    '<div style="color:#666; font-size:0.8rem;">' + (r.Sender_Role || '') + ' &bull; ' + (r.Sender_TAP_ID || '') + '</div>' +
    '<div style="color:#aaa; font-size:0.9rem; margin:8px 0;">' + (r.Message || '') + '</div>' +
    '<div style="color:#555; font-size:0.75rem;">' + new Date(r.Sent_At).toLocaleDateString() + '</div>' +
    '</div>' +
    '<span style="padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold;' +
    'background:' + (r.Status === 'Accepted' ? '#1B5E2033' : r.Status === 'Declined' ? '#B71C1C33' : '#7B590033') + ';' +
    'color:' + (r.Status === 'Accepted' ? '#4CAF50' : r.Status === 'Declined' ? '#EF5350' : '#D4AF37') + ';">' +
    r.Status + '</span>' +
    '</div>' +
    (r.Status === 'Pending' ?
      '<div style="display:flex; gap:8px; margin-top:12px;">' +
      '<button class=approve-btn onclick="respondToCollab(' + r.Request_ID + ',\'Accepted\')">Accept</button>' +
      '<button class=reject-btn  onclick="respondToCollab(' + r.Request_ID + ',\'Declined\')">Decline</button>' +
      '</div>' : '') +
    '</div>'
  ).join('');
}

function renderCollabSent(data) {
  const el = document.getElementById('collabSent');
  if (!el) return;
  if (!data.length) {
    el.innerHTML = '<p class=no-data>You have not sent any collab requests yet.</p>'; return;
  }
  el.innerHTML = data.map(r =>
    '<div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:8px; padding:16px; margin-bottom:12px;">' +
    '<div style="display:flex; justify-content:space-between;">' +
    '<div>' +
    '<div style="color:#eee; font-weight:600;">To: ' + r.Receiver_Name + '</div>' +
    '<div style="color:#666; font-size:0.8rem;">' + (r.Receiver_Role || '') + '</div>' +
    '<div style="color:#aaa; font-size:0.9rem; margin:8px 0;">' + (r.Message || '') + '</div>' +
    '<div style="color:#555; font-size:0.75rem;">Sent: ' + new Date(r.Sent_At).toLocaleDateString() + '</div>' +
    '</div>' +
    '<span style="padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold;' +
    'background:' + (r.Status === 'Accepted' ? '#1B5E2033' : r.Status === 'Declined' ? '#B71C1C33' : '#7B590033') + ';' +
    'color:' + (r.Status === 'Accepted' ? '#4CAF50' : r.Status === 'Declined' ? '#EF5350' : '#D4AF37') + ';">' +
    r.Status + '</span>' +
    '</div></div>'
  ).join('');
}

async function respondToCollab(requestId, status) {
  const token = localStorage.getItem('artistToken');
  const res   = await fetch('/api/collab-request/' + requestId, {
    method:  'PUT',
    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ status })
  });
  const data = await res.json();
  alert(data.message);
  loadCollabRequests();
}


// ── Notifications ────────────────────────────────────────────────


async function loadNotificationCount() {
  const token = localStorage.getItem('artistToken');
  if (!token) return;
  try {
    const res  = await fetch('/api/notifications/count', {
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    const badge = document.getElementById('notifCount');
    if (badge) {
      badge.textContent = data.unread;
      badge.style.display = data.unread > 0 ? 'flex' : 'none';
    }
  } catch { }
}


async function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    await loadNotifications();
  } else {
    panel.style.display = 'none';
  }
}


async function loadNotifications() {
  const token = localStorage.getItem('artistToken');
  try {
    const res  = await fetch('/api/notifications', {
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    const list = document.getElementById('notifList');
    if (!data.length) {
      list.innerHTML = '<p style="padding:16px; color:#555; font-style:italic;">No notifications yet.</p>';
      return;
    }
    list.innerHTML = data.map(n =>
      '<div style="padding:12px 16px; border-bottom:1px solid #222;' +
      ' background:' + (n.Is_Read ? '#111' : '#1a1a1a') + ';">' +
      '<div style="color:' + (n.Is_Read ? '#666' : '#eee') + '; font-size:0.85rem;">' +
      (n.Message || '') + '</div>' +
      '<div style="color:#555; font-size:0.75rem; margin-top:4px;">' +
      new Date(n.Created_At).toLocaleDateString() + '</div>' +
      '</div>'
    ).join('');
    // Mark as read
    await markAllRead();
  } catch { }
}


async function markAllRead() {
  const token = localStorage.getItem('artistToken');
  try {
    await fetch('/api/notifications/read', {
      method: 'PUT', headers: { 'Authorization': token }
    });
    const badge = document.getElementById('notifCount');
    if (badge) badge.style.display = 'none';
  } catch { }
}


async function showLoginNotifPopup() {
  const token = localStorage.getItem('artistToken');
  if (!token) return;
  try {
    const res  = await fetch('/api/notifications/count', {
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    if (data.unread > 0) {
      const popup = document.createElement('div');
      popup.style.cssText = 'position:fixed; bottom:24px; right:24px; z-index:9999;' +
        'background:#1a1a1a; border:1px solid #B8860B; border-radius:12px;' +
        'padding:16px 20px; max-width:300px; box-shadow:0 8px 32px rgba(0,0,0,0.8);';
      popup.innerHTML = '<div style="color:#D4AF37; font-weight:bold; margin-bottom:6px;">&#128276; New Notifications</div>' +
        '<div style="color:#aaa; font-size:0.85rem;">You have ' + data.unread + ' unread notification' +
        (data.unread !== 1 ? 's' : '') + ' since your last visit.</div>' +
        '<div style="display:flex; gap:8px; margin-top:12px;">' +
        '<button onclick="toggleNotifPanel(); this.closest(\'div\').parentElement.remove()"' +
        ' style="flex:1; padding:8px; background:#B8860B; color:#000; border:none;' +
        ' border-radius:6px; cursor:pointer; font-weight:bold;">View</button>' +
        '<button onclick="this.closest(\'div\').parentElement.remove()"' +
        ' style="flex:1; padding:8px; background:transparent; color:#666;' +
        ' border:1px solid #333; border-radius:6px; cursor:pointer;">Dismiss</button>' +
        '</div>';
      document.body.appendChild(popup);
      setTimeout(() => { if (popup.parentElement) popup.remove(); }, 8000);
    }
  } catch { }
}


// Load notification preferences into modal
async function loadNotifPreferences() {
  const token = localStorage.getItem('artistToken');
  try {
    const res  = await fetch('/api/notifications/preferences', {
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    const set  = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val === 1; };
    set('prefCollab',    data.Collab_Requests);
    set('prefProfile',   data.Profile_Views);
    set('prefMessages',  data.New_Messages);
    set('prefFollowers', data.New_Followers);
    set('prefCity',      data.New_Users_City);
    set('prefEmail',     data.Email_Alerts);
  } catch { }
}


async function saveNotifPreferences() {
  const token = localStorage.getItem('artistToken');
  const get   = id => { const el = document.getElementById(id); return el ? el.checked : false; };
  await fetch('/api/notifications/preferences', {
    method:  'PUT',
    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      collabRequests: get('prefCollab'),
      profileViews:   get('prefProfile'),
      newMessages:    get('prefMessages'),
      newFollowers:   get('prefFollowers'),
      newUsersCity:   get('prefCity'),
      emailAlerts:    get('prefEmail')
    })
  });
}



// ── Messaging ────────────────────────────────────────────────────

// ── Messages Page ─────────────────────────────────────────────────
let activeConvId   = null;
let activeRecvId   = null;
let activeRecvName = null;

function switchMsgTab(tab) {
  document.getElementById('tabConversations').classList.toggle('active', tab === 'conversations');
  document.getElementById('tabRequests').classList.toggle('active', tab === 'requests');
  document.getElementById('tabConvBtn').classList.toggle('active', tab === 'conversations');
  document.getElementById('tabReqBtn').classList.toggle('active', tab === 'requests');
  if (tab === 'requests') loadCollabRequestsForMessages();
}
async function loadConversations() {
  const token = localStorage.getItem('artistToken');
  if (!token) { window.location.href = 'index.html'; return; }
  try {
    // Load both active conversations and accepted connections
    const [convRes, connRes] = await Promise.all([
      fetch('/api/messages/conversations', { headers: { 'Authorization': token } }),
      fetch('/api/connections',            { headers: { 'Authorization': token } })
    ]);
    const conversations = await convRes.json();
    const connections   = await connRes.json();
    const list = document.getElementById('convList');
    if (!list) return;

    // Find connections that do not have a conversation yet
    const existingIds = conversations.map(c => c.Other_ID);
    const newConns    = connections.filter(c => !existingIds.includes(c.Other_Login_ID));

    if (!conversations.length && !newConns.length) {
      list.innerHTML = '<div class="empty-sidebar">No conversations yet.<br>Accept a collab request to start messaging.</div>';
      return;
    }

    // Update unread badge
    const unread = conversations.reduce((sum, c) => sum + (c.Unread_Count || 0), 0);
    const badge  = document.getElementById('convBadge');
    if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'inline-flex' : 'none'; }

    // Render active conversations first
    const convHtml = conversations.map(c => {
      const initials = (c.Other_Name || 'U').charAt(0).toUpperCase();
      return '<div class="conv-item" onclick="openConversation(' +
        c.Other_ID + ',\'' + (c.Other_Name||'').replace(/'/g,"\\'") + '\',\'' + c.Conversation_ID + '\')">' +
        '<div class="conv-avatar">' + initials + '</div>' +
        '<div style="flex:1; min-width:0;">' +
        '<div class="conv-name">' + (c.Other_Name || 'Unknown') + '</div>' +
        '<div style="color:#555; font-size:0.75rem;">' +
        new Date(c.Last_Message_At).toLocaleDateString() + '</div>' +
        '</div>' +
        (c.Unread_Count > 0 ? '<span class="conv-unread">' + c.Unread_Count + '</span>' : '') +
        '</div>';
    }).join('');

    // Render new connections with no messages yet
    const newHtml = newConns.length ?
      '<div style="padding:8px 16px; color:#555; font-size:0.72rem; text-transform:uppercase; letter-spacing:1px; border-top:1px solid #1a1a1a;">New Connections</div>' +
      newConns.map(c => {
        const initials = (c.Other_Name || 'U').charAt(0).toUpperCase();
        const convId   = [JSON.parse(atob(token.split('.')[1])).loginId, c.Other_Login_ID].sort((a,b)=>a-b).join('-');
        return '<div class="conv-item" onclick="openConversation(' +
          c.Other_Login_ID + ',\'' + (c.Other_Name||'').replace(/'/g,"\\'") + '\',\'' + convId + '\')">' +
          '<div class="conv-avatar" style="background:linear-gradient(135deg,#1565C0,#42A5F5);">' + initials + '</div>' +
          '<div style="flex:1; min-width:0;">' +
          '<div class="conv-name">' + (c.Other_Name || 'Unknown') + '</div>' +
          '<div style="color:#1565C0; font-size:0.72rem;">New connection -- say hello!</div>' +
          '</div>' +
          '</div>';
      }).join('') : '';

    list.innerHTML = convHtml + newHtml;
  } catch (err) { console.error('loadConversations error:', err); }
}

async function loadCollabRequestsForMessages() {
  const token = localStorage.getItem('artistToken');
  try {
    const res  = await fetch('/api/collab-requests', {
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    const list = document.getElementById('reqList');
    if (!list) return;
    const received = data.received || [];
    const sent     = data.sent     || [];
    const pending  = received.filter(r => r.Status === 'Pending');
    const badge    = document.getElementById('reqBadge');
    if (badge) { badge.textContent = pending.length; badge.style.display = pending.length > 0 ? 'inline-flex' : 'none'; }
    if (!received.length && !sent.length) {
      list.innerHTML = '<div class="empty-sidebar">No collab requests yet.</div>';
      return;
    }
    let html = '';
    if (received.length) {
      html += '<div style="padding:10px 16px; color:#666; font-size:0.75rem; text-transform:uppercase; letter-spacing:1px;">Received</div>';
      html += received.map(r => {
        const color = r.Status === 'Accepted' ? '#2E7D32' : r.Status === 'Declined' ? '#B71C1C' : '#B8860B';
        const bg    = r.Status === 'Accepted' ? '#1B5E2033' : r.Status === 'Declined' ? '#B71C1C33' : '#7B590033';
        return '<div class="req-card" style="border-left:3px solid ' + color + ';">' +
          '<div class="req-name">' + r.Sender_Name + '</div>' +
          '<div class="req-role">' + (r.Sender_Role || '') + ' &bull; ' + (r.Sender_TAP_ID || '') + '</div>' +
          '<div class="req-msg">' + (r.Message || '') + '</div>' +
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<span class="req-status" style="background:' + bg + '; color:' + color + ';">' + r.Status + '</span>' +
          '<span style="color:#555; font-size:0.72rem;">' + new Date(r.Sent_At).toLocaleDateString() + '</span>' +
          '</div>' +
          (r.Status === 'Pending' ?
            '<div class="req-btns">' +
            '<button onclick="respondMsgCollab(' + r.Request_ID + ',\'Accepted\')" style="background:#1B5E20; color:#fff;">Accept</button>' +
            '<button onclick="respondMsgCollab(' + r.Request_ID + ',\'Declined\')" style="background:#B71C1C; color:#fff;">Decline</button>' +
            '</div>' : '') +
          '</div>';
      }).join('');
    }
    if (sent.length) {
      html += '<div style="padding:10px 16px; color:#666; font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-top:8px;">Sent</div>';
      html += sent.map(r => {
        const color = r.Status === 'Accepted' ? '#2E7D32' : r.Status === 'Declined' ? '#B71C1C' : '#B8860B';
        const bg    = r.Status === 'Accepted' ? '#1B5E2033' : r.Status === 'Declined' ? '#B71C1C33' : '#7B590033';
        return '<div class="req-card">' +
          '<div class="req-name">To: ' + r.Receiver_Name + '</div>' +
          '<div class="req-role">' + (r.Receiver_Role || '') + '</div>' +
          '<div class="req-msg">' + (r.Message || '') + '</div>' +
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<span class="req-status" style="background:' + bg + '; color:' + color + ';">' + r.Status + '</span>' +
          '<span style="color:#555; font-size:0.72rem;">' + new Date(r.Sent_At).toLocaleDateString() + '</span>' +
          '</div></div>';
      }).join('');
    }
    list.innerHTML = html;
  } catch (err) { console.error('loadCollabRequestsForMessages error:', err); }
}

async function respondMsgCollab(requestId, status) {
  const token = localStorage.getItem('artistToken');
  const res   = await fetch('/api/collab-request/' + requestId, {
    method:  'PUT',
    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ status })
  });
  const data = await res.json();
  alert(data.message);
  loadCollabRequestsForMessages();
  if (status === 'Accepted') loadConversations();
}

async function openConversation(receiverId, receiverName, convId) {
  activeConvId   = convId;
  activeRecvId   = receiverId;
  activeRecvName = receiverName;
  const token  = localStorage.getItem('artistToken');
  const myId   = JSON.parse(atob(token.split('.')[1])).loginId;
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  const panel  = document.getElementById('chatPanel');
  panel.innerHTML =
    '<div class="chat-header">' +
    '<div class="conv-avatar">' + receiverName.charAt(0).toUpperCase() + '</div>' +
    '<div style="color:#eee; font-weight:600;">' + receiverName + '</div>' +
    '</div>' +
    '<div class="chat-messages" id="chatMessages"></div>' +
    '<div class="chat-input-row">' +
    '<textarea class="chat-input" id="msgInput" placeholder="Type a message..."' +
    ' onkeydown="if(event.key===\'Enter\' && !event.shiftKey){ event.preventDefault(); sendMessage(); }" rows="1"></textarea>' +
    '<button class="chat-send-btn" onclick="sendMessage()">Send</button>' +
    '</div>';
  try {
    const res  = await fetch('/api/messages/' + convId, {
      headers: { 'Authorization': token }
    });
    const msgs = await res.json();
    const box  = document.getElementById('chatMessages');
    if (!msgs.length) {
      box.innerHTML = '<p style="color:#555; text-align:center; margin-top:40px;">No messages yet. Say hello!</p>';
    } else {
      box.innerHTML = msgs.map(m => {
        const isMine = m.Sender_ID === myId;
        return '<div style="display:flex; flex-direction:column; align-items:' + (isMine ? 'flex-end' : 'flex-start') + ';">' +
          '<div class="msg-bubble ' + (isMine ? 'msg-sent' : 'msg-received') + '">' + m.Message_Text + '</div>' +
          '<div class="msg-time">' + new Date(m.Sent_At).toLocaleTimeString() + '</div>' +
          '</div>';
      }).join('');
      box.scrollTop = box.scrollHeight;
    }
    loadConversations();
  } catch (err) { console.error('openConversation error:', err); }
}

async function sendMessage() {
  if (!activeRecvId) return;
  const token = localStorage.getItem('artistToken');
  const input = document.getElementById('msgInput');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await fetch('/api/messages', {
      method:  'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ receiverId: activeRecvId, messageText: text })
    });
    openConversation(activeRecvId, activeRecvName, activeConvId);
  } catch (err) { console.error('sendMessage error:', err); }
}

// Auto load on messages page
if (document.getElementById('convList')) {
  loadConversations();
  loadCollabRequestsForMessages();
}

// ── New Message Modal ────────────────────────────────────────────
let newMsgReceiverId   = null;
let newMsgReceiverName = null;

async function openNewMessageModal() {
  document.getElementById('newMsgModal').style.display = 'block';
  document.getElementById('newMsgForm').style.display  = 'none';
  document.getElementById('newMsgText').value          = '';
  document.getElementById('newMsgStatus').textContent  = '';
  newMsgReceiverId   = null;
  newMsgReceiverName = null;

  const token = localStorage.getItem('artistToken');
  try {
    const res  = await fetch('/api/connections', {
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    const list = document.getElementById('connectionsList');

    if (!data.length) {
      list.innerHTML = '<p style="color:#555; font-style:italic; text-align:center; padding:20px;">No accepted connections yet.<br>Accept a collab request to start messaging.</p>';
      return;
    }

    list.innerHTML = data.map(c => {
      const initials = (c.Other_Name || 'U').charAt(0).toUpperCase();
      const roleColor = {
        'Artist':'#B8860B','Manager':'#1565C0','Producer':'#6A1B9A',
        'Engineer':'#2E7D32','Record Label':'#C62828','Painter':'#E65100',
        'Photographer':'#00695C','Filmmaker':'#283593','Dancer':'#00838F',
        'Fashion Designer':'#880E4F','Other':'#424242'
      }[c.Other_Role] || '#B8860B';

      return '<div onclick="selectRecipient(' + c.Other_Login_ID + ',\'' +
        (c.Other_Name||'').replace(/'/g,"\\'") + '\')"' +
        ' style="display:flex; align-items:center; gap:12px; padding:12px;' +
        ' border-radius:8px; cursor:pointer; transition:background 0.15s;' +
        ' margin-bottom:4px;"' +
        ' onmouseover="this.style.background=\'#222\'"' +
        ' onmouseout="this.style.background=\'transparent\'">' +
        '<div style="width:40px; height:40px; border-radius:50%;' +
        ' background:' + roleColor + '44; border:2px solid ' + roleColor + ';' +
        ' display:flex; align-items:center; justify-content:center;' +
        ' color:' + roleColor + '; font-weight:bold; font-size:0.9rem; flex-shrink:0;">' +
        initials + '</div>' +
        '<div>' +
        '<div style="color:#eee; font-weight:500;">' + (c.Other_Name || 'Unknown') + '</div>' +
        '<div style="color:#666; font-size:0.78rem;">' + (c.Other_Role || '') +
        (c.Other_TAP_ID ? ' &bull; ' + c.Other_TAP_ID : '') + '</div>' +
        '</div>' +
        '<div style="margin-left:auto; color:#444; font-size:0.8rem;">&#8594;</div>' +
        '</div>';
    }).join('');
  } catch {
    document.getElementById('connectionsList').innerHTML =
      '<p style="color:#f44336; text-align:center;">Could not load connections.</p>';
  }
}

function selectRecipient(id, name) {
  newMsgReceiverId   = id;
  newMsgReceiverName = name;
  document.getElementById('newMsgRecipient').textContent = name;
  document.getElementById('connectionsList').style.display = 'none';
  document.getElementById('newMsgForm').style.display      = 'block';
  document.getElementById('newMsgText').focus();
}

function clearRecipient() {
  newMsgReceiverId   = null;
  newMsgReceiverName = null;
  document.getElementById('connectionsList').style.display = 'block';
  document.getElementById('newMsgForm').style.display      = 'none';
  document.getElementById('newMsgText').value              = '';
  document.getElementById('newMsgStatus').textContent      = '';
}

function closeNewMessageModal() {
  document.getElementById('newMsgModal').style.display = 'none';
}

async function sendNewMessage() {
  if (!newMsgReceiverId) return;
  const token = localStorage.getItem('artistToken');
  const text  = document.getElementById('newMsgText').value.trim();
  const status = document.getElementById('newMsgStatus');

  if (!text) {
    status.style.color   = '#f44336';
    status.textContent   = 'Please write a message before sending.';
    return;
  }

  try {
    const res  = await fetch('/api/messages', {
      method:  'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ receiverId: newMsgReceiverId, messageText: text })
    });
    const data = await res.json();

    if (res.ok) {
      status.style.color = '#4CAF50';
      status.textContent = 'Message sent to ' + newMsgReceiverName + '!';
      document.getElementById('newMsgText').value = '';
      setTimeout(() => {
        closeNewMessageModal();
        window.location.href = 'messages.html';
      }, 1500);
    } else {
      status.style.color = '#f44336';
      status.textContent = data.message;
    }
  } catch {
    status.style.color = '#f44336';
    status.textContent = 'Something went wrong. Try again.';
  }
}

// Close modal when clicking outside
document.addEventListener('click', e => {
  const modal = document.getElementById('newMsgModal');
  if (modal && e.target === modal) closeNewMessageModal();
});



// ── Auto-run when on dashboard page ─────────────────────────────
if (document.getElementById("welcomeMsg")) loadDashboard();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('TAP service worker registered'))
      .catch(err => console.log('SW error:', err));
  });
}
// ── Push Notification Subscription ──────────────────────────────
async function subscribeToPush(token) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const vapidRes = await fetch('/api/push/vapid-key');
    const { publicKey } = await vapidRes.json();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey
    });
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });
    console.log('Push notifications enabled');
  } catch (err) {
    console.log('Push subscription skipped:', err.message);
  }
}

// ── Test Push Notification ───────────────────────────────────────
async function testPushNotification() {
  const token = localStorage.getItem('artistToken');
  if (!token) return alert('Please log in first.');
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    if (res.ok) {
      alert('Test notification sent! You should receive it shortly.');
    } else {
      alert('Failed: ' + data.message + '\nMake sure you have allowed notifications in your browser.');
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
// ── Forgot Password ─────────────────────────────────────────────
function showForgotPassword(e) {
  if (e) e.preventDefault();
  const modal = document.getElementById('forgotModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('forgotEmail').value = '';
    document.getElementById('forgotMsg').textContent = '';
  }
}

function closeForgotModal() {
  const modal = document.getElementById('forgotModal');
  if (modal) modal.style.display = 'none';
}

async function submitForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  const msg   = document.getElementById('forgotMsg');

  if (!email) {
    msg.style.color = '#f44336';
    msg.textContent = 'Please enter your email address.';
    return;
  }

  try {
    const res  = await fetch('/api/forgot-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email })
    });
    const data = await res.json();
    // Always show success message even if email not found (security best practice)
    msg.style.color = '#4CAF50';
    msg.textContent = 'If that email is registered, a reset link is on its way.';
  } catch {
    msg.style.color = '#f44336';
    msg.textContent = 'Something went wrong. Try again.';
  }
}

// Close forgot modal when clicking outside
document.addEventListener('click', e => {
  const modal = document.getElementById('forgotModal');
  if (modal && e.target === modal) closeForgotModal();
});
// ── Manual Push Subscribe ────────────────────────────────────────
async function manualSubscribePush() {
  const token = localStorage.getItem('artistToken');
  if (!token) return alert('Please log in first.');
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return alert('Push not supported in this browser.');
    }
    const permission = await Notification.requestPermission();
    alert('Permission status: ' + permission);
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    const vapidRes = await fetch('/api/push/vapid-key');
    const { publicKey } = await vapidRes.json();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey
    });

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });
    const data = await res.json();
    alert('Subscribe result: ' + data.message);
  } catch (err) {
    alert('Subscribe error: ' + err.message);
  }
}

// ── Spotify Integration ──────────────────────────────────────────
async function loadSpotifyData() {
  const token = localStorage.getItem('artistToken');
  if (!token) return;
  try {
    const statusRes = await fetch('/api/spotify/status', { headers: { 'Authorization': token } });
    const status = await statusRes.json();
    const connectBtn    = document.getElementById('spotifyConnectBtn');
    const disconnectBtn = document.getElementById('spotifyDisconnectBtn');
    if (status.connected) {
      if (connectBtn)    connectBtn.style.display    = 'none';
      if (disconnectBtn) disconnectBtn.style.display = 'inline';
      const myRes  = await fetch('/api/spotify/my-stats', { headers: { 'Authorization': token } });
      const myData = await myRes.json();
      if (myData.connected) { renderSpotifyPersonal(myData); return; }
    }
    const pubRes  = await fetch('/api/spotify/public-stats', { headers: { 'Authorization': token } });
    const pubData = await pubRes.json();
    if (pubData.connected) renderSpotifyPublic(pubData);
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify') === 'connected') {
      history.replaceState({}, '', '/dashboard.html');
      loadSpotifyData();
    }
  } catch (err) { console.log('Spotify load error:', err.message); }
}

function renderSpotifyPublic(data) {
  const el = document.getElementById('spotifyContainer');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">' +
    (data.image ? '<img src="' + data.image + '" style="width:72px;height:72px;border-radius:50%;object-fit:cover;"/>' : '') +
    '<div><div style="color:#eee;font-size:1.1rem;font-weight:bold;">' + data.name + '</div>' +
    '<div style="color:#1DB954;font-size:0.9rem;">' + Number(data.followers).toLocaleString() + ' followers &bull; Popularity: ' + data.popularity + '/100</div>' +
    '<div style="color:#666;font-size:0.8rem;">' + (data.genres||[]).slice(0,3).join(', ') + '</div></div></div>' +
    '<div style="font-size:0.75rem;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Top Tracks (Public)</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px;">' +
    (data.topTracks||[]).map((t,i) =>
      '<div style="display:flex;align-items:center;gap:12px;background:#1a1a1a;border-radius:8px;padding:10px 14px;">' +
      (t.image ? '<img src="' + t.image + '" style="width:40px;height:40px;border-radius:4px;"/>' : '') +
      '<div style="flex:1;"><div style="color:#eee;font-size:0.9rem;">' + t.name + '</div>' +
      '<div style="color:#666;font-size:0.78rem;">' + (t.album||'') + '</div></div>' +
      '<div style="color:#1DB954;font-size:0.8rem;">&#9889; ' + t.popularity + '</div></div>'
    ).join('') + '</div>' +
    '<p style="color:#555;font-size:0.75rem;margin-top:12px;">Connect your Spotify account above for personal streaming data.</p>';
}

function renderSpotifyPersonal(data) {
  const el = document.getElementById('spotifyContainer');
  if (!el) return;
  el.innerHTML = '<div style="font-size:0.75rem;color:#1DB954;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">&#10003; Personal Account Connected</div>' +
    '<div style="font-size:0.75rem;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Your Top Tracks This Month</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">' +
    (data.topTracks||[]).map((t,i) =>
      '<div style="display:flex;align-items:center;gap:12px;background:#1a1a1a;border-radius:8px;padding:10px 14px;">' +
      (t.image ? '<img src="' + t.image + '" style="width:40px;height:40px;border-radius:4px;"/>' : '') +
      '<div style="flex:1;"><div style="color:#eee;font-size:0.9rem;">' + t.name + '</div>' +
      '<div style="color:#666;font-size:0.78rem;">' + (t.artist||'') + '</div></div>' +
      '<div style="color:#D4AF37;font-size:0.75rem;">#' + (i+1) + '</div></div>'
    ).join('') + '</div>' +
    '<div style="font-size:0.75rem;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Recently Played</div>' +
    '<div style="display:flex;flex-direction:column;gap:6px;">' +
    (data.recentTracks||[]).slice(0,5).map(t =>
      '<div style="display:flex;align-items:center;gap:12px;background:#1a1a1a;border-radius:8px;padding:8px 14px;">' +
      (t.image ? '<img src="' + t.image + '" style="width:36px;height:36px;border-radius:4px;"/>' : '') +
      '<div style="flex:1;"><div style="color:#eee;font-size:0.85rem;">' + (t.name||'') + '</div>' +
      '<div style="color:#666;font-size:0.75rem;">' + (t.artist||'') + '</div></div>' +
      '<div style="color:#444;font-size:0.7rem;">' + (t.playedAt ? new Date(t.playedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '') + '</div></div>'
    ).join('') + '</div>';
}

function connectSpotify() {
  const token = localStorage.getItem('artistToken');
  if (!token) return;
  const payload = JSON.parse(atob(token.split('.')[1]));
  window.location.href = '/api/spotify/connect?loginId=' + payload.loginId;
}

async function disconnectSpotify() {
  const token = localStorage.getItem('artistToken');
  if (!confirm('Disconnect your Spotify account?')) return;
  await fetch('/api/spotify/disconnect', { method: 'DELETE', headers: { 'Authorization': token } });
  const connectBtn    = document.getElementById('spotifyConnectBtn');
  const disconnectBtn = document.getElementById('spotifyDisconnectBtn');
  if (connectBtn)    connectBtn.style.display    = 'inline';
  if (disconnectBtn) disconnectBtn.style.display = 'none';
  document.getElementById('spotifyContainer').innerHTML = '<p class="no-data">Spotify disconnected.</p>';
}
