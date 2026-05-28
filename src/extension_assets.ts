export const EXT_MANIFEST = `{
  "manifest_version": 3,
  "name": "REZ AI Meeting Companion",
  "version": "1.0.0",
  "description": "Capture real-time Google Meet stream screens and audio, synchronizing directly with REZ AI Workspace.",
  "permissions": [
    "activeTab",
    "tabCapture",
    "desktopCapture",
    "storage",
    "sidePanel"
  ],
  "host_permissions": [
    "*://*/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "side_panel": {
    "default_path": "popup.html"
  },
  "action": {
    "default_title": "REZ AI Companion"
  }
}`;

export const EXT_BACKGROUND = `// REZ AI Chrome Extension Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log("REZ AI Meeting Companion installed.");
});

// Configure Side Panel behavior to open when clicking the toolbar extension action icon
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("Error setting panel behavior:", error));
}
`;

export const EXT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>REZ AI Companion</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-width: 300px;
      margin: 0;
      padding: 16px;
      background-color: #F8F7F4;
      color: #1A1A1A;
      box-sizing: border-box;
    }
    .container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #E5E5E1;
      padding-bottom: 8px;
    }
    .logo {
      background-color: #1A1A1A;
      color: #FFFFFF;
      font-family: Georgia, serif;
      font-weight: bold;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }
    .title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .tabs {
      display: flex;
      border-bottom: 2px solid #E5E5E1;
      margin-top: 4px;
    }
    .tab {
      flex: 1;
      text-align: center;
      padding: 8px 0;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #71716A;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .tab.active {
      color: #0D9488;
      border-bottom-color: #0D9488;
    }
    .view {
      display: none;
      flex-direction: column;
      gap: 12px;
    }
    .view.active {
      display: flex;
    }
    .hint {
      font-size: 11px;
      color: #71716A;
      line-height: 1.4;
      background-color: #FFFFFF;
      border: 1px solid #E5E5E1;
      border-radius: 8px;
      padding: 8px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      color: #71716A;
      letter-spacing: 0.05em;
    }
    input {
      background-color: #FFFFFF;
      border: 1px solid #E5E5E1;
      border-radius: 8px;
      padding: 8px;
      font-size: 12px;
      color: #1A1A1A;
      outline: none;
    }
    input:focus {
      border-color: #1A1A1A;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
    }
    button {
      background-color: #1A1A1A;
      color: #FFFFFF;
      border: none;
      border-radius: 8px;
      padding: 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    button:hover {
      background-color: #000000;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-secondary {
      background-color: #FFFFFF;
      color: #1A1A1A;
      border: 1px solid #E5E5E1;
    }
    .btn-secondary:hover {
      background-color: #F8F7F4;
    }
    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      margin-top: 4px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #E5E5E1;
    }
    .dot.active {
      background-color: #10B981;
      box-shadow: 0 0 6px #10B981;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { opacity: 0.3; }
      50% { opacity: 1; }
      100% { opacity: 0.3; }
    }
    .event-card {
      background-color: #FFFFFF;
      border: 1px solid #E5E5E1;
      border-radius: 10px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      transition: all 0.2s;
    }
    .event-card.active {
      border-color: #0D9488;
      background-color: #F0FDF4;
    }
    .event-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
    }
    .event-title {
      font-size: 11px;
      font-weight: 700;
      color: #1A1A1A;
      line-height: 1.35;
    }
    .event-source {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 1px 4px;
      border-radius: 4px;
      background-color: #EFF6FF;
      color: #1D4ED8;
      border: 1px solid #DBEAFE;
    }
    .event-source.outlook {
      background-color: #F0FDF4;
      color: #15803D;
      border-color: #DCFCE7;
    }
    .event-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-size: 10px;
      color: #71716A;
    }
    .event-time {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .event-platform {
      font-weight: 600;
    }
    .event-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    .btn-mini {
      flex: 1;
      padding: 5px 8px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      border-radius: 6px;
      border: 1px solid #E5E5E1;
      background: #FFFFFF;
      color: #71716A;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: all 0.2s;
    }
    .btn-mini:hover:not(:disabled) {
      border-color: #1A1A1A;
      color: #1A1A1A;
    }
    .btn-mini:disabled {
      opacity: 0.5;
    }
    .btn-mini-primary {
      background: #0D9488;
      color: #FFFFFF;
      border-color: #0D9488;
    }
    .btn-mini-primary:hover:not(:disabled) {
      background: #0F766E;
      border-color: #0F766E;
      color: #FFFFFF;
    }
    a {
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">R</div>
      <div class="title">REZ AI Companion</div>
    </div>

    <!-- TABS NAVIGATION -->
    <div class="tabs">
      <div class="tab active" id="tab-record">Meeting Ingest</div>
      <div class="tab" id="tab-calendar">Calendar Sync</div>
    </div>

    <!-- VIEW RECORD -->
    <div id="view-record" class="view active">
      <div class="hint">
        Run your Google Meet. Click <strong>Connect & Record</strong> below, grab the correct tab stream, and synchronize live meeting transcriptions to your account securely.
      </div>

      <div class="form-group">
        <label for="serverUrl">Workspace URL</label>
        <input type="text" id="serverUrl" placeholder="https://..." value="">
      </div>

      <div class="form-group">
        <label for="userId">Firebase User UID</label>
        <input type="text" id="userId" placeholder="Enter your User UID (copy from profile)">
      </div>

      <div class="form-group">
        <label for="meetingTitle">Meeting Title</label>
        <input type="text" id="meetingTitle" placeholder="e.g. Google Meet Client sync" value="Google Meet Dialogue">
      </div>

      <div class="status-badge">
        <span id="statusDot" class="dot"></span>
        <span id="statusText">Disconnected</span>
      </div>

      <div class="actions">
        <button id="startBtn">Connect & Record Tab</button>
        <button id="stopBtn" class="btn-secondary" disabled>Stop & Sync Minutes</button>
      </div>
    </div>

    <!-- VIEW CALENDAR -->
    <div id="view-calendar" class="view">
      <div class="hint">
        Display upcoming meetings from your linked workspace. Easily trigger the Rez AI Bot to auto-join.
      </div>

      <div class="calendar-status" style="background-color: #FFFFFF; border: 1px solid #E5E5E1; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; font-weight: 700; color: #1A1A1A;">Workspace Connection</span>
          <span id="calConnBadge" style="font-size: 8px; text-transform: uppercase; font-weight: 700; padding: 1.5px 5px; border-radius: 99px; background: #FEF3C7; color: #D97706; border: 1px solid #FDE68A;">Checking...</span>
        </div>
        <div id="calConnUser" style="font-size: 10px; color: #71716A; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-top: 2px;">
          Retreiving feed settings...
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
        <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #71716A; letter-spacing: 0.05em;">Upcoming Meetings</span>
        <span id="refreshCalBtn" style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #0D9488; cursor: pointer; display: flex; align-items: center; gap: 3px;">
          Refresh Feed
        </span>
      </div>

      <div id="eventsList" style="display: flex; flex-direction: column; gap: 8px; max-height: 195px; overflow-y: auto;">
        <!-- Dynamic meeting cards loaded from local database -->
      </div>
    </div>

    <div class="actions" style="margin-top: 4px; border-top: 1px solid #E5E5E1; padding-top: 8px;">
      <button id="openWorkspaceBtn" class="btn-secondary">Open REZ AI Workspace</button>
    </div>
  </div>

  <script src="popup.js"></script>
</body>
</html>`;

export const EXT_JS = `// REZ AI chrome extension popup controller
document.addEventListener('DOMContentLoaded', async () => {
  const serverUrlInput = document.getElementById('serverUrl');
  const userIdInput = document.getElementById('userId');
  const meetingTitleInput = document.getElementById('meetingTitle');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const openWorkspaceBtn = document.getElementById('openWorkspaceBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // Tab navigation elements
  const tabRecord = document.getElementById('tab-record');
  const tabCalendar = document.getElementById('tab-calendar');
  const viewRecord = document.getElementById('view-record');
  const viewCalendar = document.getElementById('view-calendar');

  // Calendar sync specific elements
  const calConnBadge = document.getElementById('calConnBadge');
  const calConnUser = document.getElementById('calConnUser');
  const eventsList = document.getElementById('eventsList');
  const refreshCalBtn = document.getElementById('refreshCalBtn');

  // Auto detect current server URL from chrome environment or default
  let defaultUrl = window.location.origin;
  if (defaultUrl.startsWith('chrome-extension')) {
    defaultUrl = 'http://localhost:3000'; // Set default locally
  }
  serverUrlInput.value = defaultUrl;

  // Load configuration from local storage or Chrome storage
  function saveConfig() {
    const serverUrl = serverUrlInput.value.trim();
    const userId = userIdInput.value.trim();
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ serverUrl, userId });
    } else {
      localStorage.setItem('rez_server_url', serverUrl);
      localStorage.setItem('rez_user_id', userId);
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['serverUrl', 'userId'], (data) => {
      if (data.serverUrl) serverUrlInput.value = data.serverUrl;
      if (data.userId) userIdInput.value = data.userId;
    });
  } else {
    const savedUrl = localStorage.getItem('rez_server_url');
    const savedUser = localStorage.getItem('rez_user_id');
    if (savedUrl) serverUrlInput.value = savedUrl;
    if (savedUser) userIdInput.value = savedUser;
  }

  // TABS TOGGLING
  tabRecord.addEventListener('click', () => {
    tabRecord.classList.add('active');
    tabCalendar.classList.remove('active');
    viewRecord.classList.add('active');
    viewCalendar.classList.remove('active');
  });

  tabCalendar.addEventListener('click', () => {
    tabCalendar.classList.add('active');
    tabRecord.classList.remove('active');
    viewCalendar.classList.add('active');
    viewRecord.classList.remove('active');
    saveConfig();
    loadCalendarData();
  });

  // REFRESH TARGET
  refreshCalBtn.addEventListener('click', () => {
    saveConfig();
    loadCalendarData();
  });

  // LOAD CALENDAR FEED DATA FROM WORKSPACE SERVER
  async function loadCalendarData() {
    const serverUrl = serverUrlInput.value.trim();
    const userId = userIdInput.value.trim();

    if (!serverUrl) {
      eventsList.innerHTML = \`<div style="font-size: 11px; color:#ef4444; text-align:center; padding:15px 0;">Error: Set Workspace URL first</div>\`;
      calConnBadge.textContent = "Offline";
      calConnBadge.style.background = "#FEE2E2";
      calConnBadge.style.color = "#991B1B";
      calConnBadge.style.borderColor = "#FCA5A5";
      return;
    }

    calConnBadge.textContent = "Syncing...";
    calConnBadge.style.background = "#FEF3C7";
    calConnBadge.style.color = "#D97706";
    calConnBadge.style.borderColor = "#FDE68A";
    
    eventsList.innerHTML = \`
      <div style="font-size: 11px; color:#71716A; text-align:center; padding:20px 0;">
        <span style="font-weight: 700; color: #0D9488;">Connecting to matrix...</span>
      </div>
    \`;

    try {
      let googleConnected = false;
      let googleEmail = "";
      
      try {
        const statusRes = await fetch(\`\${serverUrl}/api/calendars/status\`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          googleConnected = statusData.googleConnected;
          googleEmail = statusData.googleEmail || "";
        }
      } catch (err) {
        console.warn("Could not query calendar state:", err);
      }

      if (googleConnected) {
        calConnBadge.textContent = "Active Sync";
        calConnBadge.style.background = "#D1FAE5";
        calConnBadge.style.color = "#065F46";
        calConnBadge.style.borderColor = "#A7F3D0";
        calConnUser.textContent = \`Google Account: \${googleEmail || "Active Sync"}\`;
      } else {
        calConnBadge.textContent = "Demo / Off";
        calConnBadge.style.background = "#F3F4F6";
        calConnBadge.style.color = "#374151";
        calConnBadge.style.borderColor = "#E5E7EB";
        calConnUser.textContent = "Simulated / Authenticate in portal";
      }

      let events = [];
      try {
        const googleEvtsRes = await fetch(\`\${serverUrl}/api/calendars/google/events?token=\`);
        if (googleEvtsRes.ok) {
          const arr = await googleEvtsRes.json();
          if (Array.isArray(arr)) {
            events = events.concat(arr.map(evt => ({ ...evt, source: 'google' })));
          }
        }
      } catch (e) {
        console.warn("Google events grab failure:", e);
      }

      events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      if (events.length === 0) {
        eventsList.innerHTML = \`
          <div style="font-size: 11px; color:#71716A; text-align:center; padding:25px 0;">
            <div style="font-weight:700; color:#1A1A1A; margin-bottom:4px;">No activities indexed</div>
            No upcoming Google Calendar events. Link calendar inside user dashboard.
          </div>
        \`;
        return;
      }

      eventsList.innerHTML = "";
      events.forEach(evt => {
        const card = document.createElement('div');
        card.className = "event-card";
        
        const isGoogle = evt.source === 'google';
        const rawDate = evt.startTime ? new Date(evt.startTime) : new Date();
        const dateStr = rawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateDay = rawDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

        card.innerHTML = biographyTemplate(evt, isGoogle, dateDay, dateStr);
        eventsList.appendChild(card);
      });

      function biographyTemplate(evt, isGoogle, dateDay, dateStr) {
        return \`
          <div class="event-header">
            <span class="event-title">\${escapeHtml(evt.title)}</span>
            <span class="event-source \${!isGoogle ? 'outlook' : ''}">\${isGoogle ? 'Google' : 'Outlook'}</span>
          </div>
          <div class="event-meta">
            <div class="event-time">
              <span>\${dateDay}, \${dateStr}</span>
            </div>
            <span class="event-platform" style="color: \${evt.platform === 'google_meet' ? '#0D9488' : '#71716A'}">
              \${evt.platform === 'google_meet' ? 'Google Meet' : 'Teams / Web'}
            </span>
          </div>
          <div class="event-actions">
            \${evt.joinUrl ? \`<button class="btn-mini btn-join-room" data-url="\${escapeHtml(evt.joinUrl)}">Join Room</button>\` : \`<span style="font-size: 9px; color:#71716A; padding: 4px 0;">No Join URL</span>\`}
            <button class="btn-mini btn-mini-primary btn-trigger-bot" data-title="\${escapeHtml(evt.title)}" data-platform="\${escapeHtml(evt.platform)}" data-joinurl="\${escapeHtml(evt.joinUrl || '')}">
              Trigger AI Bot
            </button>
          </div>
        \`;
      }

      eventsList.querySelectorAll('.btn-join-room').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const url = e.currentTarget.getAttribute('data-url');
          if (url) {
            window.open(url, '_blank');
          }
        });
      });

      eventsList.querySelectorAll('.btn-trigger-bot').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const b = e.currentTarget;
          const title = b.getAttribute('data-title');
          const platform = b.getAttribute('data-platform');
          const joinUrl = b.getAttribute('data-joinurl');

          b.disabled = true;
          b.textContent = "Deploying...";

          try {
            const simRes = await fetch(\`\${serverUrl}/api/meetings/simulate\`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                title: title,
                platform: platform || "google-meet",
                template: "scrum",
                instructions: \`Triggered from Chrome Companion Bar. Join URL: \${joinUrl || 'None'}\`,
                userId: userId || "anonymous"
              })
            });

            if (simRes.ok) {
              b.textContent = "Syncing!";
              b.style.borderColor = "#10B981";
              b.style.color = "#10B981";
              b.style.background = "#ECFDF5";
              alert(\`Successfully triggered REZ AI transcriptions bot to join: "\${title}"! Check your web workspace dashboard.\`);
            } else {
              throw new Error("Activation block rejected.");
            }
          } catch (err) {
            b.disabled = false;
            b.textContent = "Trigger AI Bot";
            alert("Spawning bot error: " + err.message);
          }
        });
      });

    } catch (err) {
      console.error(err);
      eventsList.innerHTML = \`<div style="font-size: 11px; color:#ef4444; text-align:center; padding:15px 0;">Failed reaching synchronizers: \${err.message}</div>\`;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  startBtn.addEventListener('click', async () => {
    const serverUrl = serverUrlInput.value.trim();
    const userId = userIdInput.value.trim();
    const title = meetingTitleInput.value.trim();

    if (!serverUrl) {
      alert('Workspace URL is required.');
      return;
    }
    if (serverUrl.includes('meet.google.com') || serverUrl.includes('zoom.us') || serverUrl.includes('teams.microsoft')) {
      alert('Invalid Workspace URL!\\n\\nDo not enter your Google Meet or huddle link here. You must enter your REZ AI Workspace URL (e.g. http://localhost:3000 when running locally, or your production backend server address).');
      return;
    }
    if (!userId) {
      alert('Please enter your Firebase User UID to sync minutes with your account.');
      return;
    }

    // Save config for recorder tab
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ serverUrl, userId, currentMeetingTitle: title }, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('recorder.html') });
      });
    } else {
      localStorage.setItem('rez_server_url', serverUrl);
      localStorage.setItem('rez_user_id', userId);
      localStorage.setItem('rez_current_title', title);
      window.open('recorder.html', '_blank');
    }
  });

  openWorkspaceBtn.addEventListener('click', () => {
    const serverUrl = serverUrlInput.value.trim();
    if (serverUrl) {
      window.open(serverUrl, '_blank');
    }
  });
});`;

export const EXT_RECORDER_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>REZ AI — Active Meeting Capture</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      background-color: #F8F7F4;
      color: #1A1A1A;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    .card {
      background: white;
      border: 1px solid #E5E5E1;
      border-radius: 24px;
      padding: 40px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
      text-align: center;
    }
    .logo {
      background-color: #1A1A1A;
      color: #FFFFFF;
      font-family: Georgia, serif;
      font-weight: bold;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      margin: 0 auto 20px auto;
    }
    h2 {
      font-family: Georgia, serif;
      font-size: 24px;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    p {
      color: #71716A;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 16px;
      border-radius: 99px;
      background: #F3F4F6;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: #71716A;
    }
    .dot.active {
      background-color: #10B981;
      box-shadow: 0 0 8px #10B981;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { opacity: 0.3; }
      50% { opacity: 1; }
      100% { opacity: 0.3; }
    }
    button {
      background-color: #1A1A1A;
      color: #FFFFFF;
      border: none;
      border-radius: 12px;
      padding: 14px 28px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      transition: background-color 0.2s;
    }
    button:hover {
      background-color: #000000;
    }
    button:disabled {
      background-color: #E5E5E1;
      color: #71716A;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">R</div>
    <h2 id="title">REZ AI Companion</h2>
    <p id="desc">Ready to establish a connection to your meeting stream.</p>
    
    <div class="status-badge">
      <span id="statusDot" class="dot"></span>
      <span id="statusText">Initializing...</span>
    </div>

    <!-- Active Audio Waveform Canvas Visualizer -->
    <div style="margin: 16px 0 24px 0; height: 64px; display: flex; align-items: center; justify-content: center; border-radius: 12px; border: 1px solid #E5E5E1; overflow: hidden; background: #F8F7F4;">
      <canvas id="waveform" width="360" height="64" style="width: 100%; height: 100%; display: block;"></canvas>
    </div>
    
    <button id="actionBtn">Start Sharing Tab & Recording</button>
  </div>
  <script src="recorder.js"></script>
</body>
</html>`;

export const EXT_RECORDER_JS = `document.addEventListener('DOMContentLoaded', async () => {
  const titleEl = document.getElementById('title');
  const descEl = document.getElementById('desc');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const actionBtn = document.getElementById('actionBtn');

  let serverUrl = "";
  let userId = "";
  let meetingTitle = "";
  
  let mediaRecorder = null;
  let audioChunks = [];
  let stream = null;
  let isRecording = false;
  let micStream = null;
  let audioCtx = null;
  let recorderMimeType = "audio/webm";

  // Retrieve parameters from storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['serverUrl', 'userId', 'currentMeetingTitle'], (data) => {
      serverUrl = data.serverUrl || "http://localhost:3000";
      userId = data.userId || "";
      meetingTitle = data.currentMeetingTitle || "Google Meet Dialogue";
      initUI();
    });
  } else {
    serverUrl = localStorage.getItem('rez_server_url') || "http://localhost:3000";
    userId = localStorage.getItem('rez_user_id') || "";
    meetingTitle = localStorage.getItem('rez_current_title') || "Google Meet Dialogue";
    initUI();
  }

  function initUI() {
    titleEl.textContent = meetingTitle;
    descEl.textContent = \`Syncing to local workspace at \${serverUrl}\`;
    statusText.textContent = "Ready to connect";
    statusDot.className = "dot";
    actionBtn.textContent = "Start Sharing Tab & Recording";
  }

  actionBtn.addEventListener('click', async () => {
    if (!isRecording) {
      await startRecording();
    } else {
      stopRecording();
    }
  });

  async function startRecording() {
    try {
      statusText.textContent = "Awaiting screen selection...";
      statusDot.className = "dot active";
      
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      // Try to acquire microphone to merge client voices and speaker voice
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micErr) {
        console.warn("Microphone access declined, only recording display audio feedback:", micErr);
      }

      let mixedStream = null;
      
      if (micStream && (stream.getAudioTracks().length > 0 || micStream.getAudioTracks().length > 0)) {
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AudioContextClass();
          const dest = audioCtx.createMediaStreamDestination();

          let connected = false;
          if (stream.getAudioTracks().length > 0) {
            const displaySource = audioCtx.createMediaStreamSource(stream);
            displaySource.connect(dest);
            connected = true;
          }
          if (micStream.getAudioTracks().length > 0) {
            const micSource = audioCtx.createMediaStreamSource(micStream);
            micSource.connect(dest);
            connected = true;
          }

          if (connected) {
            mixedStream = dest.stream;
          }
        } catch (e) {
          console.warn("Web Audio mixing failed, falling back to display stream audio:", e);
        }
      }

      if (!mixedStream) {
        const audioTracks = [];
        if (stream.getAudioTracks().length > 0) {
          audioTracks.push(stream.getAudioTracks()[0]);
        } else if (micStream && micStream.getAudioTracks().length > 0) {
          audioTracks.push(micStream.getAudioTracks()[0]);
        }
        mixedStream = new MediaStream(audioTracks);
      }

      if (mixedStream.getAudioTracks().length === 0) {
        alert("Warning: No audio track shared. Please check the 'Share tab audio' tick box next time.");
      }

      let options = { mimeType: 'audio/webm' };
      recorderMimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
        recorderMimeType = 'audio/webm;codecs=opus';
      }

      mediaRecorder = new MediaRecorder(mixedStream, options);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        await uploadRecording();
      };

      if (stream.getVideoTracks().length > 0) {
        stream.getVideoTracks()[0].onended = () => {
          if (isRecording) {
            stopRecording();
          }
        };
      }

      mediaRecorder.start(100);
      isRecording = true;
      actionBtn.textContent = "Stop & Sync Minutes";
      statusText.textContent = "Recording Meet Stream Live...";
      descEl.textContent = "Do not close this tab. Keep the meeting screen active.";

      // Setup Live Waveform Visualizer
      if (audioCtx && mixedStream) {
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(mixedStream);
        source.connect(analyser);
        analyser.fftSize = 64;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const canvas = document.getElementById('waveform');
        const canvasCtx = canvas.getContext('2d');
        
        function draw() {
          if (!isRecording) {
            canvasCtx.fillStyle = '#F8F7F4';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            canvasCtx.beginPath();
            canvasCtx.moveTo(0, canvas.height / 2);
            canvasCtx.lineTo(canvas.width, canvas.height / 2);
            canvasCtx.strokeStyle = '#E5E5E1';
            canvasCtx.stroke();
            return;
          }
          requestAnimationFrame(draw);
          
          analyser.getByteFrequencyData(dataArray);
          
          canvasCtx.fillStyle = '#F8F7F4';
          canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
          
          const barWidth = (canvas.width / bufferLength) * 1.5;
          let barHeight;
          let x = 0;
          
          for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2.5;
            
            canvasCtx.fillStyle = \`rgba(13, 148, 136, \${barHeight/128 + 0.15})\`;
            canvasCtx.fillRect(x, (canvas.height - barHeight) / 2, barWidth - 2, barHeight);
            
            x += barWidth;
          }
        }
        draw();
      }
    } catch (err) {
      console.error("Stream capture failed:", err);
      statusText.textContent = "Failed";
      statusDot.className = "dot";
      alert("Multimodal capture denied: " + err.message);
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    actionBtn.disabled = true;
    actionBtn.textContent = "Uploading...";

    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
    if (audioCtx) {
      try {
        audioCtx.close();
      } catch (e) {}
      audioCtx = null;
    }
  }

  async function uploadRecording() {
    statusText.textContent = "Processing and converting audio...";
    statusDot.className = "dot";

    try {
      const audioBlob = new Blob(audioChunks, { type: recorderMimeType });
      const base64Audio = await blobToBase64(audioBlob);

      statusText.textContent = "Uploading to server...";
      
      const response = await fetch(\`\${serverUrl}/api/meetings/upload-audio\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId,
          title: meetingTitle || \`Google Meet Companion — \${new Date().toLocaleTimeString()}\`,
          platform: "google-meet",
          template: "client",
          base64Audio: base64Audio,
          fileType: recorderMimeType
        })
      });

      if (response.ok) {
        statusText.textContent = "Minutes Sync Success!";
        alert("Success! The meeting audio has been synchronized. You can now close this tab.");
        window.close();
      } else {
        const errData = await response.json();
        throw new Error(errData.error || "Failed server sync.");
      }
    } catch (uploadErr) {
      console.error("Upload error:", uploadErr);
      statusText.textContent = "Upload failed.";
      alert(\`Failed synchronizing meeting: \${uploadErr.message}\`);
      actionBtn.disabled = false;
      actionBtn.textContent = "Retry Sync";
    } finally {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultStr = reader.result;
        const base64Marker = ";base64,";
        const markerIndex = resultStr.indexOf(base64Marker);
        let base64String = "";
        if (markerIndex !== -1) {
          base64String = resultStr.substring(markerIndex + base64Marker.length);
        } else {
          const firstCommaIndex = resultStr.indexOf(",");
          base64String = firstCommaIndex !== -1 ? resultStr.substring(firstCommaIndex + 1) : resultStr;
        }
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
});`;
