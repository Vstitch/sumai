import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up larger limit for base64 audio uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// --- PERSISTENT DATA FILE HANDLING ---
const DB_FILE = path.join(process.cwd(), "meetings_db.json");

interface ActionItem {
  id: string;
  meetingId: string;
  owner: string;
  task: string;
  deadline: string;
  status: 'pending' | 'completed';
}

interface TranscriptChunk {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

interface Report {
  summary: string;
  decisions: string[];
  risks: string[];
  nextMeeting?: string;
  templateSpecific: Record<string, string | string[]>;
}

interface FollowUpData {
  email: string;
  slack: string;
  recap: string;
}

interface Meeting {
  id: string;
  userId?: string;
  title: string;
  date: string;
  duration: number; // in seconds
  platform: 'zoom' | 'google-meet' | 'teams' | 'slack' | 'discord' | 'recording';
  template: 'scrum' | 'client' | 'interview' | 'sales' | 'investor';
  status: 'processing' | 'completed' | 'failed';
  error?: string;
  transcript: TranscriptChunk[];
  report?: Report;
  actionItems: ActionItem[];
  followUp?: FollowUpData;
  videoUrl?: string;
  audioUrl?: string;
  hasVideo?: boolean;
  hasAudio?: boolean;
  spokenLanguage?: string;
  translated?: boolean;
}

// Generate unique ID helper
const generateId = () => "meet_" + Math.random().toString(36).substring(2, 11);

// Boot up initial sample data
const bootstrapData: Meeting[] = [];

// Read from database
function readDb(): Meeting[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(data);
    } else {
      // Bootstrap with preloaded samples
      writeDb(bootstrapData);
      return bootstrapData;
    }
  } catch (e) {
    console.error("Error reading database file, returning in-memory bootstrap:", e);
    return bootstrapData;
  }
}

// Write to database
function writeDb(data: Meeting[]) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing database file:", e);
  }
}

// --- LAZY INITIALIZATION OF GEMINI SDK CLIENT ---
let aiInstance: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiInstance) {
    let key = process.env.GEMINI_API_KEY;
    if (!key) {
      try {
        const envExamplePath = path.join(process.cwd(), ".env.example");
        if (fs.existsSync(envExamplePath)) {
          const content = fs.readFileSync(envExamplePath, "utf-8");
          const match = content.match(/GEMINI_API_KEY\s*=\s*["']?([^"\n\r']+)["']?/);
          if (match && match[1] && match[1] !== "MY_GEMINI_API_KEY" && !match[1].includes("YOUR_")) {
            key = match[1].trim();
            console.log("Loaded GEMINI_API_KEY from .env.example fallback");
          }
        }
      } catch (err) {
        console.error("Failed to read .env.example fallback:", err);
      }
    }
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is not defined on the server side.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiInstance;
}

// --- DEFINE SCHEMA FOR RESPONSES ---
const geminiJsonSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "A highly descriptive, smart title for the meeting." },
    durationSeconds: { type: Type.INTEGER, description: "Calculated duration of this discussion in seconds." },
    transcript: {
      type: Type.ARRAY,
      description: "Dialogue broken down into speaker parts.",
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING, description: "The name of the speaking individual." },
          start: { type: Type.NUMBER, description: "The timestamp in seconds since the meeting started when this chunk begins." },
          end: { type: Type.NUMBER, description: "The timestamp in seconds since the meeting started when this chunk ends." },
          text: { type: Type.STRING, description: "The text of what was spoken." }
        },
        required: ["speaker", "start", "end", "text"]
      }
    },
    report: {
      type: Type.OBJECT,
      description: "Structured corporate analysis reports.",
      properties: {
        summary: { type: Type.STRING, description: "A detailed markdown content containing discussions, key contexts, and summaries." },
        decisions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of critical commitments or decisions reached." },
        risks: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of hazards, conflicts, or roadblocks identified." },
        nextMeeting: { type: Type.STRING, description: "Recommended follow up sync date and topic." },
        templateSpecific: {
          type: Type.OBJECT,
          description: "Crucial context properties based on meeting category.",
          properties: {
            "Blockers": { type: Type.STRING, description: "Sprint bottleneck summaries for agile scrum syncs." },
            "Sprint Updates": { type: Type.STRING, description: "Overall sprint achievement highlights." },
            "Requirements": { type: Type.STRING, description: "Client deliverables checklists and requirements." },
            "Deliverables": { type: Type.STRING, description: "Concrete code/system deliverables expected of agency." },
            "Strengths": { type: Type.STRING, description: "Key applicant virtues for screening/interview reviews." },
            "Concerns": { type: Type.STRING, description: "Aptitude, experience or logistical risks in applicant profile." },
            "Recommendation": { type: Type.STRING, description: "Clear progression recommendation (e.g. Reject, Hire, Panel Sync)." },
            "Objections": { type: Type.STRING, description: "Customer pricing/timeline or technical constraints." },
            "Pricing Concerns": { type: Type.STRING, description: "How pricing structures fit into sales expectations." },
            "Metrics": { type: Type.STRING, description: "Key operational or performance metric disclosures for investors." },
            "Asks": { type: Type.STRING, description: "Capital, resource, or partnership asks defined in board sync." }
          }
        }
      },
      required: ["summary", "decisions", "risks"]
    },
    actionItems: {
      type: Type.ARRAY,
      description: "Action assignments with owners.",
      items: {
        type: Type.OBJECT,
        properties: {
          owner: { type: Type.STRING, description: "Who owns the task specifically (often John, Sarah, or Vinitha)." },
          task: { type: Type.STRING, description: "Distinct, actionable task description." },
          deadline: { type: Type.STRING, description: "Target deadline description (e.g. Wednesday, Monday Sync, Next week)." }
        },
        required: ["owner", "task", "deadline"]
      }
    },
    followUp: {
      type: Type.OBJECT,
      description: "AI Generated ready-to-deploy sync messages.",
      properties: {
        email: { type: Type.STRING, description: "Subject line and clear formatted corporate email draft body." },
        slack: { type: Type.STRING, description: "Rich Slack markdown text format summary featuring list items and highlights." },
        recap: { type: Type.STRING, description: "A quick, humble executive summary recap." }
      },
      required: ["email", "slack", "recap"]
    }
  },
  required: ["title", "durationSeconds", "transcript", "report", "actionItems", "followUp"]
};

// --- CALENDAR SYNC PERSISTENT STORAGE ---
const CAL_DB_FILE = path.join(process.cwd(), "calendars_db.json");

interface CalendarDesignation {
  eventId: string;
  source: 'google' | 'outlook';
  title: string;
  startTime: string;
  autoJoin: boolean;
  platform: string;
  joinUrl: string;
}

interface CalendarsDb {
  googleConnected: boolean;
  googleEmail?: string;
  outlookConnected: boolean;
  outlookEmail?: string;
  designations: Record<string, CalendarDesignation>;
}

function readCalDb(): CalendarsDb {
  try {
    if (fs.existsSync(CAL_DB_FILE)) {
      const data = fs.readFileSync(CAL_DB_FILE, "utf-8");
      return JSON.parse(data);
    } else {
      const defaultDb: CalendarsDb = {
        googleConnected: false,
        outlookConnected: false,
        designations: {}
      };
      writeCalDb(defaultDb);
      return defaultDb;
    }
  } catch (e) {
    console.error("Error reading calendars_db.json:", e);
    return {
      googleConnected: false,
      outlookConnected: false,
      designations: {}
    };
  }
}

function writeCalDb(data: CalendarsDb) {
  try {
    fs.writeFileSync(CAL_DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing calendars_db.json:", e);
  }
}

function detectPlatform(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("meet.google.com")) return "google-meet";
  if (lower.includes("zoom.us")) return "zoom";
  if (lower.includes("teams.microsoft.com") || lower.includes("teams.live.com")) return "teams";
  if (lower.includes("slack.com") || lower.includes("huddle")) return "slack";
  if (lower.includes("discord.gg") || lower.includes("discord.com")) return "discord";
  return "recording";
}

function extractMeetingLink(text: string): string {
  const meetRegex = /(https?:\/\/[^\s"'<>]*(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|slack\.com|discord\.com)[^\s"'<>]*)/i;
  const match = text.match(meetRegex);
  return match ? match[1] : "";
}

// --- HTTP API ROUTERS ---

// --- CALENDAR SYNCHRONIZATION ENDPOINTS ---

// Get calendars connection status and designations list
app.get("/api/calendars/status", (req, res) => {
  try {
    res.json(readCalDb());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update calendars connection state
app.post("/api/calendars/status", (req, res) => {
  try {
    const { googleConnected, googleEmail, outlookConnected, outlookEmail } = req.body;
    const db = readCalDb();
    if (googleConnected !== undefined) db.googleConnected = googleConnected;
    if (googleEmail !== undefined) db.googleEmail = googleEmail;
    if (outlookConnected !== undefined) db.outlookConnected = outlookConnected;
    if (outlookEmail !== undefined) db.outlookEmail = outlookEmail;
    writeCalDb(db);
    res.json(db);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle designations list for auto-join
app.post("/api/calendars/designations/toggle", (req, res) => {
  try {
    const { eventId, source, title, startTime, platform, joinUrl } = req.body;
    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }
    const db = readCalDb();
    if (db.designations[eventId]) {
      db.designations[eventId].autoJoin = !db.designations[eventId].autoJoin;
      if (!db.designations[eventId].autoJoin) {
        delete db.designations[eventId];
      }
    } else {
      db.designations[eventId] = {
        eventId,
        source: source || 'google',
        title: title || 'Untitled Sync',
        startTime: startTime || new Date().toISOString(),
        autoJoin: true,
        platform: platform || 'google-meet',
        joinUrl: joinUrl || ''
      };
    }
    writeCalDb(db);
    res.json({ success: true, designations: db.designations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Microsoft Outlook OAuth Link Endpoint
app.get('/api/auth/outlook/url', (req, res) => {
  const host = process.env.APP_URL || `https://${req.headers.host}`;
  const redirectUri = `${host}/auth/outlook/callback`;

  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID || "fa8bcaee-177b-402a-9ca8-3a8fd02f3a67",
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "offline_access https://graph.microsoft.com/Calendars.Read",
    state: "outlook-state"
  });

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  res.json({ url: authUrl });
});

// Microsoft Outlook OAuth Callback Endpoint
app.get(['/auth/outlook/callback', '/auth/outlook/callback/'], async (req, res) => {
  const { code } = req.query;
  const host = process.env.APP_URL || `https://${req.headers.host}`;
  const redirectUri = `${host}/auth/outlook/callback`;

  let tokenData = null;
  if (code && process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET) {
    try {
      const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.OUTLOOK_CLIENT_ID,
          client_secret: process.env.OUTLOOK_CLIENT_SECRET,
          code: code as string,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        })
      });
      if (response.ok) {
        tokenData = await response.json();
      }
    } catch (err) {
      console.error("Failed exchanging Outlook code for token:", err);
    }
  }

  res.send(`
    <html>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #F8F7F4; margin: 0;">
        <div style="text-align: center; background: white; padding: 40px; border-radius: 20px; border: 1px solid #E5E5E1; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="font-family: serif; color: #1A1A1A;">Connecting Outlook Calendar...</h2>
          <p style="color: #71716A; font-size: 14px;">Please wait while we establish your secure feed to Rez AI.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'OAUTH_OUTLOOK_SUCCESS',
                token: ${tokenData ? JSON.stringify(tokenData.access_token) : 'null'}
              }, '*');
              setTimeout(() => {
                window.close();
              }, 1000);
            } else {
              window.location.href = '/';
            }
          </script>
        </div>
      </body>
    </html>
  `);
});

// Google Calendar Real and Mock Events Proxy
app.get("/api/calendars/google/events", async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.json([
      {
        id: "google-evt-1",
        title: "Q3 Products Alignment (Simulated Workspace)",
        startTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        platform: "google-meet",
        joinUrl: "https://meet.google.com/abc-defg-hij",
        source: "google",
        autoJoin: false
      },
      {
        id: "google-evt-2",
        title: "Developer Sync & Review (Simulated Calendar)",
        startTime: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
        platform: "zoom",
        joinUrl: "https://zoom.us/j/1234567890",
        source: "google",
        autoJoin: false
      }
    ]);
  }
  try {
    const timeMin = new Date().toISOString();
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&singleEvents=true&orderBy=startTime&maxResults=15`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.ok) {
      const data = await response.json();
      const events = (data.items || []).map((evt: any) => ({
        id: evt.id,
        title: evt.summary || "No Title",
        startTime: evt.start?.dateTime || evt.start?.date || new Date().toISOString(),
        endTime: evt.end?.dateTime || evt.end?.date || new Date().toISOString(),
        platform: detectPlatform(evt.description || evt.location || evt.hangoutLink || ""),
        joinUrl: evt.hangoutLink || extractMeetingLink(evt.description || evt.location || ""),
        source: "google",
        autoJoin: false
      }));
      res.json(events);
    } else {
      res.status(response.status).json({ error: "Failed fetching Google events" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Microsoft Outlook Calendar Real and Mock Events Proxy
app.get("/api/calendars/outlook/events", async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.json([
      {
        id: "outlook-evt-1",
        title: "Agency Retrospective & Backlog Sync (Microsoft)",
        startTime: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 75 * 60 * 1000).toISOString(),
        platform: "teams",
        joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_simulated_outlook",
        source: "outlook",
        autoJoin: false
      },
      {
        id: "outlook-evt-2",
        title: "Acme Deal Review (Microsoft Outlook Feed)",
        startTime: new Date(Date.now() + 240 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 270 * 60 * 1000).toISOString(),
        platform: "zoom",
        joinUrl: "https://zoom.us/j/simulated_zoom_outlook_url",
        source: "outlook",
        autoJoin: false
      }
    ]);
  }
  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/calendar/events", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.ok) {
      const data = await response.json();
      const events = (data.value || []).map((evt: any) => ({
        id: evt.id,
        title: evt.subject || "No Subject",
        startTime: evt.start?.dateTime || new Date().toISOString(),
        endTime: evt.end?.dateTime || new Date().toISOString(),
        platform: detectPlatform(evt.bodyPreview || evt.location?.displayName || evt.onlineMeeting?.joinUrl || ""),
        joinUrl: evt.onlineMeeting?.joinUrl || extractMeetingLink(evt.bodyPreview || ""),
        source: "outlook",
        autoJoin: false
      }));
      res.json(events);
    } else {
      res.status(response.status).json({ error: "Failed fetching Outlook events" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Get all meetings
app.get("/api/meetings", (req, res) => {
  try {
    const { userId } = req.query;
    const list = readDb();
    if (userId) {
      const filtered = list.filter(m => m.userId === userId || m.userId === undefined || m.userId === "anonymous");
      res.json(filtered);
    } else {
      res.json(list);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Toggle Action Item Status
app.post("/api/meetings/:meetingId/actions/:actionId/toggle", (req, res) => {
  try {
    const { meetingId, actionId } = req.params;
    const list = readDb();
    const meet = list.find(m => m.id === meetingId);
    if (!meet) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
    const idx = meet.actionItems.findIndex(a => a.id === actionId);
    if (idx === -1) {
      res.status(404).json({ error: "Action item not found" });
      return;
    }
    meet.actionItems[idx].status = meet.actionItems[idx].status === 'pending' ? 'completed' : 'pending';
    writeDb(list);
    res.json(meet);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Delete Meeting
app.delete("/api/meetings/:id", (req, res) => {
  try {
    const { id } = req.params;
    let list = readDb();
    list = list.filter(m => m.id !== id);
    writeDb(list);
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Run AI Simulation Generative Meeting
app.post("/api/meetings/simulate", async (req, res) => {
  const { title, platform, template, instructions, userId } = req.body;

  if (!title || !template) {
    res.status(400).json({ error: "Title and template are required parameters." });
    return;
  }

  // Create temporary record showing "processing"
  const mId = generateId();
  const list = readDb();
  const freshMeeting: Meeting = {
    id: mId,
    userId: userId || "anonymous",
    title: title,
    date: new Date().toISOString(),
    duration: 120, // baseline placeholder
    platform: platform || "zoom",
    template: template,
    status: "processing",
    transcript: [],
    actionItems: []
  };
  list.unshift(freshMeeting);
  writeDb(list);

  try {
    const ai = getAiClient();
    const systemPrompt = `You are an advanced AI Meeting Analyst. Your task is to generate simulated multi-speaker transcript dialogue AND structured reports for a corporate meeting.
    Title requested: "${title}"
    Meeting platform: "${platform}"
    Template selected: "${template}" (Scrum updates / Client feedback / Interview scores / Sales Objections / Investor asks)
    Additional detail: "${instructions || 'No extra context provided. Invent a hyper-realistic, highly relevant industry topic.'}"

    Develop a rich, highly authentic transcript conversation (at least 5 exchanges between speakers such as John, Sarah, Vinitha, HR, Liam, or external stakeholders) with proper timestamps, discussions, decisions, risks, action items, and template-specific blocks. Make the discussion content realistic, engaging, and highly professional. Return JSON matching the required schema. Ensure values in templateSpecific match properties that fit the "${template}" category. Example: if scrum, populate "Blockers" and "Sprint Updates". If client, populate "Requirements" and "Deliverables". If interview, populate "Strengths" and "Concerns".
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: geminiJsonSchema,
        temperature: 0.7
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("No output response text returned from Gemini API");
    }

    const aiResult = JSON.parse(outputText.trim());

    // Merge generated fields into our meeting
    const completedList = readDb();
    const currentIdx = completedList.findIndex(m => m.id === mId);
    if (currentIdx !== -1) {
      const dbMeet = completedList[currentIdx];
      dbMeet.title = aiResult.title || title;
      dbMeet.duration = aiResult.durationSeconds || 120;
      dbMeet.status = "completed";
      dbMeet.transcript = aiResult.transcript || [];
      dbMeet.report = aiResult.report || { summary: "Summary missing", decisions: [], risks: [], templateSpecific: {} };
      
      // Inject IDs for action items
      dbMeet.actionItems = (aiResult.actionItems || []).map((a: any, i: number) => ({
        id: `act_${mId}_${i}`,
        meetingId: mId,
        owner: a.owner || "Unspecified",
        task: a.task || "Task detail missing",
        deadline: a.deadline || "TBD",
        status: "pending" as const
      }));

      dbMeet.followUp = aiResult.followUp || { email: "", slack: "", recap: "" };

      completedList[currentIdx] = dbMeet;
      writeDb(completedList);
      res.json(dbMeet);
    } else {
      res.status(404).json({ error: "Session meeting state lost during computation." });
    }

  } catch (err: any) {
    console.error("Gemini Meeting Simulation Error:", err);
    const failedList = readDb();
    const idx = failedList.findIndex(m => m.id === mId);
    if (idx !== -1) {
      failedList[idx].status = "failed";
      failedList[idx].error = err.message || "Failed during Gemini processing";
      writeDb(failedList);
    }
    res.status(500).json({ error: `AI Processing failed: ${err.message}` });
  }
});

// 5. Run REAL Speech-to-Text Transcription via audio record / upload
app.post("/api/meetings/upload-audio", async (req, res) => {
  const { title, platform, template, base64Audio, fileType, fallbackTranscript, userId, spokenLanguage, translateToEnglish } = req.body;

  if (!base64Audio && !fallbackTranscript) {
    res.status(400).json({ error: "Either a base64 encoded audio sequence or a speech transcript is required for processing." });
    return;
  }

  // --- CLEAN BASE64 AND Mimetype FOR ROBUST GEMINI PROCESSING ---
  let cleanBase64 = base64Audio || "";
  if (cleanBase64) {
    const base64Marker = ";base64,";
    const markerIndex = cleanBase64.indexOf(base64Marker);
    if (markerIndex !== -1) {
      cleanBase64 = cleanBase64.substring(markerIndex + base64Marker.length);
    } else {
      // Check for generic comma prefix
      const commaIndex = cleanBase64.indexOf(",");
      if (commaIndex !== -1 && commaIndex < 100) {
        cleanBase64 = cleanBase64.substring(commaIndex + 1);
      }
    }
    // Safeguard to strip any partial or malformed base64 headers that might leak through (e.g., opus;base64)
    if (cleanBase64.includes(";base64")) {
      const idx = cleanBase64.indexOf(";base64");
      cleanBase64 = cleanBase64.substring(idx + 7);
      if (cleanBase64.startsWith(",")) {
        cleanBase64 = cleanBase64.substring(1);
      }
    }
    cleanBase64 = cleanBase64.replace(/\s/g, "");
  }

  let cleanMimeType = fileType || "audio/webm";
  if (cleanMimeType.includes(";")) {
    cleanMimeType = cleanMimeType.split(";")[0];
  }
  cleanMimeType = cleanMimeType.trim();

  const mId = generateId();

  let savedAudioUrl: string | undefined = undefined;
  let savedVideoUrl: string | undefined = undefined;
  let localHasAudio = false;
  let localHasVideo = false;

  if (cleanBase64) {
    try {
      const uploadsDir = path.join(process.cwd(), "media_uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const isVideo = cleanMimeType && cleanMimeType.includes("video");
      const ext = "webm"; // standard container format
      const fName = `meeting_${mId}.${ext}`;
      const fPath = path.join(uploadsDir, fName);
      const dataBuffer = Buffer.from(cleanBase64, "base64");
      fs.writeFileSync(fPath, dataBuffer);

      if (isVideo || (platform && platform !== "recording" && platform !== "upload")) {
        savedVideoUrl = `/media_uploads/${fName}`;
        savedAudioUrl = `/media_uploads/${fName}`;
        localHasVideo = true;
        localHasAudio = true;
      } else {
        savedAudioUrl = `/media_uploads/${fName}`;
        localHasAudio = true;
      }
    } catch (saveErr) {
      console.error("Error writing uploaded media file to disk:", saveErr);
    }
  }

  const list = readDb();
  const newRecording: Meeting = {
    id: mId,
    userId: userId || "anonymous",
    title: title || `Voice Ingested Notes — ${new Date().toLocaleTimeString()}`,
    date: new Date().toISOString(),
    duration: 12, // default short duration estimate
    platform: platform || "recording",
    template: template || "scrum",
    status: "processing",
    transcript: [],
    actionItems: [],
    audioUrl: savedAudioUrl,
    videoUrl: savedVideoUrl,
    hasAudio: localHasAudio,
    hasVideo: localHasVideo,
    spokenLanguage: spokenLanguage || 'auto',
    translated: translateToEnglish === true || translateToEnglish === 'true' || false
  };
  list.unshift(newRecording);
  writeDb(list);

  try {
    const ai = getAiClient();
    
    // Prepare multi-modal parts for Gemini
    const parts: any[] = [];

    // Pass the base64 audio block if present
    if (cleanBase64) {
      parts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: cleanMimeType
        }
      });
    }

    const isTranslating = translateToEnglish === true || translateToEnglish === 'true';
    const cleanSpokenLang = spokenLanguage || 'auto';

    const promptText = `
    You are an AI Speech-to-Text specialist and business analyst.
    Below is a voice recording submission and/or client-side browser transcript of a meeting, discussion or vocal note.
    
    ${fallbackTranscript ? `For reference, the browser real-time speech capturer logged this script draft:
    """
    ${fallbackTranscript}
    """
    Use this captured text draft to supplement, correct, or replace any noisy/missing audio pieces.` : ''}

    ${isTranslating ? `
    CRITICAL MULTILINGUAL TRANSLATION DIRECTIVE:
    The user has specified that the input spoken audio or text stream may be in a foreign language (configured language or auto-detected language is: "${cleanSpokenLang}").
    You MUST TRANSLATE all transcribing spoken dialogue and text content into fluent, professional, natural, grammatically correct ENGLISH.
    The output transcript array (including every single "text" utterance in conversational pieces) MUST be fully translated to English.
    Every part of the final structured reports, summaries, titles, decisions, action item owners/tasks, risks, follow-up emails, and template metrics must be outputted strictly in ENGLISH.
    ` : ''}

    Your tasks:
    1. Transcribe/Segment the spoken meeting content precisely with high speech fidelity. Diarize the outputs intelligently into speakers (e.g. "Speaker 1", "Speaker 2", or custom names if self-identified). If you are primarily reading the text draft, structure the speakers as sensible meeting participants (such as "Me", "Client", or self-identified names). Divide into structured chunks with start and end times in seconds.
    2. Convert this speech transcription into a full professional Meeting Analysis record.
    3. Generate high-quality Decisions, Action items, Risks, and specific template properties fitting the template category "${template || 'scrum'}".
    4. Provide neat follow up emails, slack texts and bullet summaries.
    
    Format the complete generated contents to fit the requested JSON structural schema. Return raw JSON matching the requested schema exactly.
    `;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: geminiJsonSchema,
        temperature: 0.15
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("No output speech transcription returned from Gemini SDK");
    }

    const aiResult = JSON.parse(outputText.trim());

    // Update meeting elements
    const completedList = readDb();
    const currentIdx = completedList.findIndex(m => m.id === mId);
    if (currentIdx !== -1) {
      const dbMeet = completedList[currentIdx];
      dbMeet.title = title || aiResult.title || `Voice Recording Note — ${new Date().toLocaleTimeString()}`;
      dbMeet.duration = aiResult.durationSeconds || 15;
      dbMeet.status = "completed";
      dbMeet.transcript = aiResult.transcript || [];
      dbMeet.report = aiResult.report || { summary: "Vocal recording transcription captured successfully.", decisions: [], risks: [], templateSpecific: {} };
      
      dbMeet.actionItems = (aiResult.actionItems || []).map((a: any, i: number) => ({
        id: `act_${mId}_${i}`,
        meetingId: mId,
        owner: a.owner || "You",
        task: a.task || "Actionable note item",
        deadline: a.deadline || "Next days",
        status: "pending" as const
      }));

      dbMeet.followUp = aiResult.followUp || { email: "", slack: "", recap: "" };

      completedList[currentIdx] = dbMeet;
      writeDb(completedList);
      res.json(dbMeet);
    } else {
      res.status(404).json({ error: "Session meeting state lost." });
    }

  } catch (err: any) {
    console.error("Gemini Premium Voice Transcription error:", err);
    const failedList = readDb();
    const idx = failedList.findIndex(m => m.id === mId);
    if (idx !== -1) {
      failedList[idx].status = "failed";
      failedList[idx].error = `Voice transcription failure: ${err.message}. If the recording was empty or corrupt, please try another audio sample.`;
      writeDb(failedList);
    }
    res.status(500).json({ error: `AI Speech Processing failed: ${err.message}` });
  }
});

// 6. Gemini-powered Universal Semantic Search (Meeting Memory System)
app.post("/api/search", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    res.status(400).json({ error: "Search query string is required" });
    return;
  }

  try {
    const ai = getAiClient();
    const list = readDb().filter(m => m.status === "completed");

    // Format all meeting details for Gemini semantic reading
    const formattedContext = list.map((m, index) => {
      const transcriptFormatted = m.transcript.map(t => `[${t.speaker}]: ${t.text}`).join("\n");
      const summaryFormatted = m.report?.summary || "";
      const decisionsFormatted = (m.report?.decisions || []).join(", ");
      const actionsFormatted = m.actionItems.map(a => `${a.owner} -> ${a.task} (${a.deadline})`).join("; ");
      
      return `
      Meeting Index: ${index}
      Meeting Title: "${m.title}"
      Meeting Date: ${m.date}
      Meeting Category: ${m.template}
      Summary: ${summaryFormatted}
      Decisions: ${decisionsFormatted}
      Action Items: ${actionsFormatted}
      Full Word Transcript:
      ${transcriptFormatted}
      ---
      `;
    }).join("\n\n");

    const searchPrompt = `
    You are the central Knowledge Memory Engine of Rez AI corporate intelligence network.
    A user is asking an executive question regarding their historical meeting data: "${query}".
    
    A total of ${list.length} completed meetings are stored in your memory system.
    Read the formatted meeting contexts provided below to formulate a highly helpful, factually precise answer.
    
    --- MEETING DATA START ---
    ${formattedContext}
    --- MEETING DATA END ---

    Identify:
    1. A synthesized, detailed, markdown-formatted response string ("aiAnswer") answering the user query. Reference specific meeting details, timelines, names, or metrics with elegant corporate clarity. If the answer is completely absent from the recordings, state that politely.
    2. A list of stored meetings that are relevant to this request ("meetings"), including a short description detailing why that meeting contains the answer ("relevance").
    3. Direct citations ("citations") mapping back to exact text spoken in a transcript. Provide the exact "speaker", "text" quote, and the "meetingTitle" source.

    You must format your response to EXACTLY match this JSON schema:
    {
      "aiAnswer": "Detailed markdown explanation answering key point in query...",
      "meetings": [
        { "id": "meeting-id", "title": "Meeting Title", "date": "ISO string", "platform": "zoom", "relevance": "Why relevant..." }
      ],
      "citations": [
        { "meetingTitle": "Meeting Title", "speaker": "Speaker Name", "text": "Exact text quote of context..." }
      ]
    }

    Respond with ONLY raw JSON string. Do not append explanation text outside the JSON block.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: searchPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aiAnswer: { type: Type.STRING },
            meetings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  date: { type: Type.STRING },
                  platform: { type: Type.STRING },
                  relevance: { type: Type.STRING }
                },
                required: ["id", "title", "date", "platform", "relevance"]
              }
            },
            citations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  meetingTitle: { type: Type.STRING },
                  speaker: { type: Type.STRING },
                  text: { type: Type.STRING }
                },
                required: ["meetingTitle", "speaker", "text"]
              }
            }
          },
          required: ["aiAnswer", "meetings", "citations"]
        }
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("No web content searched from Gemini engine.");
    }

    const compiledResult = JSON.parse(outputText.trim());
    
    // Map database IDs accurately to returned results to align matching links
    compiledResult.meetings = compiledResult.meetings.map((m: any) => {
      const matched = list.find(dbm => dbm.title.toLowerCase().includes(m.title.toLowerCase()) || m.title.toLowerCase().includes(dbm.title.toLowerCase()));
      return {
        ...m,
        id: matched ? matched.id : m.id
      };
    });

    res.json(compiledResult);

  } catch (err: any) {
    console.error("Gemini Semantic Search memory error:", err);
    res.status(500).json({ error: `Searching failed: ${err.message}` });
  }
});

// --- COMBINE EXPRESS ROUTERS WITH VITE AS MIDDLEWARE ---
async function startServer() {
  // Ensure the media uploads folder exists recursively on bootstrap
  const uploadsDir = path.join(process.cwd(), "media_uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use("/media_uploads", express.static(uploadsDir));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Rez AI full-stack server operating at http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
