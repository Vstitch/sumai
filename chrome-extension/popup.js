// REZ AI chrome extension popup controller
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
      eventsList.innerHTML = `<div style="font-size: 11px; color:#ef4444; text-align:center; padding:15px 0;">Error: Set Workspace URL first</div>`;
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
    
    eventsList.innerHTML = `
      <div style="font-size: 11px; color:#71716A; text-align:center; padding:20px 0;">
        <span style="font-weight: 700; color: #0D9488;">Connecting to matrix...</span>
      </div>
    `;

    try {
      let googleConnected = false;
      let googleEmail = "";
      
      try {
        const statusRes = await fetch(`${serverUrl}/api/calendars/status`);
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
        calConnUser.textContent = `Google Account: ${googleEmail || "Active Sync"}`;
      } else {
        calConnBadge.textContent = "Demo / Off";
        calConnBadge.style.background = "#F3F4F6";
        calConnBadge.style.color = "#374151";
        calConnBadge.style.borderColor = "#E5E7EB";
        calConnUser.textContent = "Simulated / Authenticate in portal";
      }

      let events = [];
      try {
        const googleEvtsRes = await fetch(`${serverUrl}/api/calendars/google/events?token=`);
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
        eventsList.innerHTML = `
          <div style="font-size: 11px; color:#71716A; text-align:center; padding:25px 0;">
            <div style="font-weight:700; color:#1A1A1A; margin-bottom:4px;">No activities indexed</div>
            No upcoming Google Calendar events. Link calendar inside user dashboard.
          </div>
        `;
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
        return `
          <div class="event-header">
            <span class="event-title">${escapeHtml(evt.title)}</span>
            <span class="event-source ${!isGoogle ? 'outlook' : ''}">${isGoogle ? 'Google' : 'Outlook'}</span>
          </div>
          <div class="event-meta">
            <div class="event-time">
              <span>${dateDay}, ${dateStr}</span>
            </div>
            <span class="event-platform" style="color: ${evt.platform === 'google_meet' ? '#0D9488' : '#71716A'}">
              ${evt.platform === 'google_meet' ? 'Google Meet' : 'Teams / Web'}
            </span>
          </div>
          <div class="event-actions">
            ${evt.joinUrl ? `<button class="btn-mini btn-join-room" data-url="${escapeHtml(evt.joinUrl)}">Join Room</button>` : `<span style="font-size: 9px; color:#71716A; padding: 4px 0;">No Join URL</span>`}
            <button class="btn-mini btn-mini-primary btn-trigger-bot" data-title="${escapeHtml(evt.title)}" data-platform="${escapeHtml(evt.platform)}" data-joinurl="${escapeHtml(evt.joinUrl || '')}">
              Trigger AI Bot
            </button>
          </div>
        `;
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
            const simRes = await fetch(`${serverUrl}/api/meetings/simulate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                title: title,
                platform: platform || "google-meet",
                template: "scrum",
                instructions: `Triggered from Chrome Companion Bar. Join URL: ${joinUrl || 'None'}`,
                userId: userId || "anonymous"
              })
            });

            if (simRes.ok) {
              b.textContent = "Syncing!";
              b.style.borderColor = "#10B981";
              b.style.color = "#10B981";
              b.style.background = "#ECFDF5";
              alert(`Successfully triggered REZ AI transcriptions bot to join: "${title}"! Check your web workspace dashboard.`);
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
      eventsList.innerHTML = `<div style="font-size: 11px; color:#ef4444; text-align:center; padding:15px 0;">Failed reaching synchronizers: ${err.message}</div>`;
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
      alert('Invalid Workspace URL!\n\nDo not enter your Google Meet or huddle link here. You must enter your REZ AI Workspace URL (e.g. http://localhost:3000 when running locally, or your production backend server address).');
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
});