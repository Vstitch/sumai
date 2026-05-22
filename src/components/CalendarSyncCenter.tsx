import React, { useState, useEffect } from 'react';
import { 
  Calendar, RefreshCw, AlertCircle, Power, Video, Check, Sparkles, Clock, LogOut, Laptop, CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Meeting } from '../types';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  platform: 'zoom' | 'google-meet' | 'teams' | 'slack' | 'discord' | 'recording';
  joinUrl: string;
  source: 'google' | 'outlook';
  autoJoin: boolean;
}

interface CalendarDesignation {
  eventId: string;
  source: 'google' | 'outlook';
  title: string;
  startTime: string;
  autoJoin: boolean;
  platform: string;
  joinUrl: string;
}

interface CalendarDbStatus {
  googleConnected: boolean;
  googleEmail?: string;
  outlookConnected: boolean;
  outlookEmail?: string;
  designations: Record<string, CalendarDesignation>;
}

interface CalendarSyncCenterProps {
  onClose: () => void;
  onMeetingCreated: (m: Meeting) => void;
}

export default function CalendarSyncCenter({ onClose, onMeetingCreated }: CalendarSyncCenterProps) {
  const [calStatus, setCalStatus] = useState<CalendarDbStatus>({
    googleConnected: false,
    outlookConnected: false,
    designations: {}
  });

  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [outlookToken, setOutlookToken] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [disconnectingProvider, setDisconnectingProvider] = useState<'google' | 'outlook' | null>(null);

  // Persisted state to determine whether to include Microsoft Outlook Integration
  const [includeOutlook, setIncludeOutlook] = useState(() => {
    try {
      const saved = localStorage.getItem('rez_include_outlook');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('rez_include_outlook', includeOutlook.toString());
    } catch (e) {
      console.error(e);
    }
  }, [includeOutlook]);

  // Active simulated bot status
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);
  const [joiningStep, setJoiningStep] = useState<string>('');

  // Fetch Calendar status from full-stack database
  const fetchStatus = async () => {
    try {
      setIsLoadingStatus(true);
      const res = await fetch('/api/calendars/status');
      if (res.ok) {
        const data: CalendarDbStatus = await res.json();
        setCalStatus(data);
      }
    } catch (err: any) {
      console.error("Failed pulling calendar status:", err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Sync / pull upcoming calendar events
  const fetchUpcomingEvents = async () => {
    try {
      setIsLoadingEvents(true);
      setErrorText('');

      const googleRes = await fetch(`/api/calendars/google/events?token=${googleToken || ""}`);
      let googleEvts: CalendarEvent[] = [];
      if (googleRes.ok) {
        googleEvts = await googleRes.json();
      }

      let outlookEvts: CalendarEvent[] = [];
      if (includeOutlook) {
        const outlookRes = await fetch(`/api/calendars/outlook/events?token=${outlookToken || ""}`);
        if (outlookRes.ok) {
          outlookEvts = await outlookRes.json();
        }
      }

      // Merge and sort chronologically
      const merged = [...googleEvts, ...outlookEvts].map(evt => {
        // Map autoJoin indicator from designated backend DB table
        const lookup = calStatus.designations[evt.id];
        return {
          ...evt,
          autoJoin: lookup ? lookup.autoJoin : false
        };
      });

      merged.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setEvents(merged);
    } catch (err: any) {
      console.error("Failed to load upcoming events:", err);
      setErrorText("Unable to pull events feed from servers.");
    } finally {
      setIsLoadingEvents(false);
    }
  };

  // Trigger events loading when tokens or connection status alters
  useEffect(() => {
    if (!isLoadingStatus) {
      fetchUpcomingEvents();
    }
  }, [googleToken, outlookToken, calStatus.googleConnected, calStatus.outlookConnected, isLoadingStatus, includeOutlook]);

  // Connect Google Calendar with explicit scoping rules
  const handleConnectGoogle = async () => {
    setErrorText('');
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      provider.addScope('https://www.googleapis.com/auth/calendar.events');

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
        
        // Sync connections with full-stack DB
        const res = await fetch('/api/calendars/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            googleConnected: true,
            googleEmail: result.user.email || 'Google Workspace'
          })
        });

        if (res.ok) {
          const statusData = await res.json();
          setCalStatus(statusData);
        }
      } else {
        throw new Error("No Google authorization token returned.");
      }
    } catch (err: any) {
      console.error("Google Calendar connection abort:", err);
      setErrorText("Google Calendar login authorization failed or was blocked by popups blocker.");
    }
  };

  // Simulate Google Developer account connection for easy local testing
  const handleSimulateGoogle = async () => {
    setErrorText('');
    try {
      const res = await fetch('/api/calendars/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleConnected: true,
          googleEmail: 'vinitha2004mega@gmail.com (Google Cloud Dev)'
        })
      });

      if (res.ok) {
        const statusData = await res.json();
        setCalStatus(statusData);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  // Custom Microsoft Azure Outlook OAuth integration
  const handleConnectOutlook = async () => {
    setErrorText('');
    try {
      const res = await fetch('/api/auth/outlook/url');
      const { url } = await res.json();
      
      const popup = window.open(url, 'outlook_auth_popup', 'width=600,height=700');
      if (!popup) {
        setErrorText("Popup blocker is active. Please enable popups to sync Outlook accounts.");
      }
    } catch (err: any) {
      console.error("Outlook connection fetch error:", err);
      setErrorText("Failed communicating with Outlook Authentication microservices.");
    }
  };

  // Listen for callback postMessage from Microsoft popup handler
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Allow only local container or Cloud Run origins
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('3000')) {
        return;
      }

      if (event.data?.type === 'OAUTH_OUTLOOK_SUCCESS') {
        const token = event.data.token;
        if (token) {
          setOutlookToken(token);
        }
        
        // Update backend database connectivity status
        const res = await fetch('/api/calendars/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outlookConnected: true,
            outlookEmail: 'vinitha.outlook@outlook.com (Microsoft AD)'
          })
        });

        if (res.ok) {
          const statusData = await res.json();
          setCalStatus(statusData);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Simulate Outlook connection feedback
  const handleSimulateOutlook = async () => {
    setErrorText('');
    try {
      const res = await fetch('/api/calendars/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outlookConnected: true,
          outlookEmail: 'vinitha2004mega@outlook.com (MS Graph Core)'
        })
      });

      if (res.ok) {
        const statusData = await res.json();
        setCalStatus(statusData);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  // Disconnect accounts
  const handleDisconnect = (provider: 'google' | 'outlook') => {
    setDisconnectingProvider(provider);
  };

  const executeDisconnect = async (provider: 'google' | 'outlook') => {
    setDisconnectingProvider(null);
    try {
      const payload = provider === 'google' 
        ? { googleConnected: false, googleEmail: null }
        : { outlookConnected: false, outlookEmail: null };

      const res = await fetch('/api/calendars/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        if (provider === 'google') setGoogleToken(null);
        if (provider === 'outlook') setOutlookToken(null);
        const statusData = await res.json();
        setCalStatus(statusData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle designations toggle
  const handleToggleDesignation = async (evt: CalendarEvent) => {
    try {
      const res = await fetch('/api/calendars/designations/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: evt.id,
          source: evt.source,
          title: evt.title,
          startTime: evt.startTime,
          platform: evt.platform,
          joinUrl: evt.joinUrl
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Update local statuses inside calendarStatus
        setCalStatus(prev => ({
          ...prev,
          designations: data.designations
        }));

        setEvents(prev => prev.map(item => {
          if (item.id === evt.id) {
            return {
              ...item,
              autoJoin: !item.autoJoin
            };
          }
          return item;
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Run auto-join bot agent simulation
  const handleTriggerBotJoin = async (evt: CalendarEvent) => {
    if (joiningEventId) return;
    setJoiningEventId(evt.id);
    
    try {
      setJoiningStep("REZ AI Bot launching to join API socket...");
      await new Promise(r => setTimeout(r, 1200));

      setJoiningStep("Securing streaming audio buffers from conference target...");
      await new Promise(r => setTimeout(r, 1500));

      setJoiningStep("Meeting complete! Bot is compiling minutes & generating AI analysis report...");
      
      const response = await fetch('/api/meetings/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: evt.title,
          platform: evt.platform,
          template: 'scrum',
          instructions: `Automatically captured from ${evt.source === 'google' ? 'Google Calendar' : 'Outlook Calendar'}. Meeting Join URL: ${evt.joinUrl || 'None provided'}.`,
          userId: auth.currentUser?.uid || "anonymous"
        })
      });

      if (response.ok) {
        const newMeeting = await response.json();
        onMeetingCreated(newMeeting);
        setJoiningStep("Analysis recorded successfully into intelligence repository!");
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw new Error("Transcribing simulation failed on server.");
      }
    } catch (err: any) {
      console.error(err);
      alert("Error joining and recording meeting: " + err.message);
    } finally {
      setJoiningEventId(null);
      setJoiningStep('');
    }
  };

  const formatEventTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white border border-[#E5E5E1] rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden animate-fade-in mb-8">
      <div className="absolute top-0 right-0 left-0 h-1 bg-teal-500" />

      {/* HEADER ROW */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E5E1] pb-6 mb-6">
        <div>
          <span className="text-[9px] uppercase font-bold tracking-widest text-teal-600 bg-teal-55 px-2.5 py-1 rounded-md">
            Integrations Center
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-[#1A1A1A] font-serif mt-2">
            Universal Calendar Alignment Setup
          </h2>
          <p className="text-xs text-[#71716A] mt-1 max-w-2xl leading-relaxed">
            Link Rez AI directly to your Google Calendar and Microsoft Outlook Feeds. Automatically join meeting rooms, transcribe discussions, and catalog minutes in one unified workspace dashboard.
          </p>
        </div>

        <button 
          onClick={onClose}
          className="self-start md:self-auto px-4 py-1.5 rounded-lg border border-[#E5E5E1] hover:border-[#1A1A1A] text-xs font-semibold text-[#71716A] hover:text-[#1A1A1A] transition shrink-0 cursor-pointer"
        >
          Close Manager
        </button>
      </div>

      {errorText && (
        <div className="mb-6 bg-red-50 border border-red-250 p-4 rounded-xl text-xs text-red-650 flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="leading-relaxed font-semibold">{errorText}</span>
        </div>
      )}

      {/* TWO COLUMNS: Connections vs Upcoming Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: PROVIDERS MANAGER (Span 5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex items-center justify-between border-b border-[#E5E5E1]/60 pb-2">
            <h3 className="text-[10px] uppercase font-bold text-[#71716A] tracking-wider">
              Calendar API Providers
            </h3>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={includeOutlook} 
                onChange={(e) => setIncludeOutlook(e.target.checked)}
                className="rounded border-[#E5E5E1] text-teal-600 focus:ring-teal-500 w-3 h-3 cursor-pointer"
              />
              <span className="text-[10px] text-[#71716A] font-medium hover:text-[#1A1A1A] transition">Include Outlook</span>
            </label>
          </div>

          {/* 1. GOOGLE CALENDAR */}
          <div className="bg-[#F8F7F4] border border-[#E5E5E1] p-5 rounded-2xl relative overflow-hidden">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-3V18h-2v-4H9V12h4V8h2v4h3v2z"
                  />
                </svg>
                <div>
                  <h4 className="text-xs font-bold text-[#1A1A1A]">Google Calendar</h4>
                  <p className="text-[10px] text-[#71716A]">Workplace, Calendar Read & Events Scopes</p>
                </div>
              </div>

              {calStatus.googleConnected ? (
                <span className="text-[9px] uppercase font-bold tracking-wider text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                  Active Connected
                </span>
              ) : (
                <span className="text-[9px] uppercase font-bold tracking-wider text-[#71716A] bg-[#E5E5E1]/40 px-2 py-0.5 rounded-full">
                  Inactive
                </span>
              )}
            </div>

            {calStatus.googleConnected ? (
              <div className="space-y-3">
                <div className="text-xs text-[#1A1A1A] font-mono bg-white p-2.5 rounded-xl border border-[#E5E5E1] truncate">
                  <span className="text-[#71716A] font-sans mr-1">Owner:</span>
                  {calStatus.googleEmail || "Google Workspace Account"}
                </div>
                <div className="flex justify-between items-center gap-2">
                  <button
                    onClick={() => handleDisconnect('google')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5E1] hover:border-[#1A1A1A] text-[10px] font-bold text-red-650 transition cursor-pointer"
                  >
                    <Power className="w-3 h-3" />
                    Disconnect Google
                  </button>
                  <button
                    onClick={fetchUpcomingEvents}
                    disabled={isLoadingEvents}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-teal-600 hover:text-teal-700 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                    Sync Feed
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                <p className="text-xs text-[#71716A] leading-relaxed">
                  Authenticate securely using Google Authentication credentials with explicit permission to view primary calendar schedules.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleConnectGoogle}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#1A1A1A] hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5 text-white" />
                    Connect Google Calendar
                  </button>
                  <button
                    onClick={handleSimulateGoogle}
                    title="Simulate integration if Google OAuth is not configured on your computer"
                    className="flex items-center justify-center p-2 rounded-xl border border-[#E5E5E1] hover:border-[#1A1A1A] text-xs text-[#71716A] hover:text-[#1A1A1A] transition cursor-pointer"
                  >
                    Demo Mode
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. MICROSOFT OUTLOOK CALENDAR */}
          {includeOutlook && (
            <div className="bg-[#F8F7F4] border border-[#E5E5E1] p-5 rounded-2xl relative overflow-hidden">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#107C41"
                      d="M16.2 2H7.8C4.6 2 2 4.6 2 7.8v8.4c0 3.2 2.6 5.8 5.8 5.8h8.4c3.2 0 5.8-2.6 5.8-5.8V7.8c0-3.2-2.6-5.8-5.8-5.8zm3.6 14.1h-4.8v3.5h-1.8v-3.5H8.4v-1.8H13.2V9.1h1.8v5.2h4.8v1.8z"
                    />
                  </svg>
                  <div>
                    <h4 className="text-xs font-bold text-[#1A1A1A]">Microsoft Outlook Calendar</h4>
                    <p className="text-[10px] text-[#71716A]">MS Exchange / Graph API Scopes</p>
                  </div>
                </div>

                {calStatus.outlookConnected ? (
                  <span className="text-[9px] uppercase font-bold tracking-wider text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                    Active Connected
                  </span>
                ) : (
                  <span className="text-[9px] uppercase font-bold tracking-wider text-[#71716A] bg-[#E5E5E1]/40 px-2 py-0.5 rounded-full">
                    Inactive
                  </span>
                )}
              </div>

              {calStatus.outlookConnected ? (
                <div className="space-y-3">
                  <div className="text-xs text-[#1A1A1A] font-mono bg-white p-2.5 rounded-xl border border-[#E5E5E1] truncate">
                    <span className="text-[#71716A] font-sans mr-1">Owner:</span>
                    {calStatus.outlookEmail || "Microsoft AD User"}
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <button
                      onClick={() => handleDisconnect('outlook')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5E1] hover:border-[#1A1A1A] text-[10px] font-bold text-red-650 transition cursor-pointer"
                    >
                      <Power className="w-3 h-3" />
                      Disconnect Outlook
                    </button>
                    <button
                      onClick={fetchUpcomingEvents}
                      disabled={isLoadingEvents}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-teal-600 hover:text-teal-700 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                      Sync Feed
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 pt-1">
                  <p className="text-xs text-[#71716A] leading-relaxed">
                    Link with Azure Active Directory. Grant read permissions for Calendar schedules so Rez AI Bot can track Teams conferences.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleConnectOutlook}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-[#1A1A1A] hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5 text-white" />
                      Connect Outlook account
                    </button>
                    <button
                      onClick={handleSimulateOutlook}
                      title="Simulate integration if Outlook API credentials are not yet updated on the workspace"
                      className="flex items-center justify-center p-2 rounded-xl border border-[#E5E5E1] hover:border-[#1A1A1A] text-xs text-[#71716A] hover:text-[#1A1A1A] transition cursor-pointer"
                    >
                      Demo Mode
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: EVENTS GRID (Span 7) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#E5E5E1]/60 pb-2">
            <h3 className="text-[10px] uppercase font-bold text-[#71716A] tracking-wider">
              Upcoming Synced Meetings ({events.length})
            </h3>
            
            {(calStatus.googleConnected || (includeOutlook && calStatus.outlookConnected)) && (
              <button
                onClick={fetchUpcomingEvents}
                disabled={isLoadingEvents}
                className="text-[10px] uppercase font-bold tracking-wider text-[#71716A] hover:text-[#1A1A1A] flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                <span>Pull feed</span>
              </button>
            )}
          </div>

          <div className="space-y-3.5">
            {isLoadingEvents ? (
              <div className="flex flex-col items-center justify-center py-16 bg-[#F8F7F4] border border-[#E5E5E1] rounded-2xl animate-pulse">
                <RefreshCw className="w-5 h-5 text-[#1A1A1A] animate-spin mb-2.5" />
                <span className="text-[10px] uppercase font-bold text-[#71716A] tracking-wider">Fetching calendar matrices...</span>
              </div>
            ) : (!calStatus.googleConnected && (!includeOutlook || !calStatus.outlookConnected)) ? (
              <div className="flex flex-col items-center justify-center text-center p-10 py-16 bg-[#F8F7F4] border border-[#E5E5E1] rounded-2xl">
                <Calendar className="w-8 h-8 text-[#71716A] mb-3.5" />
                <span className="text-xs font-bold text-[#1A1A1A]">No calendars linked</span>
                <p className="text-[10px] text-[#71716A] mt-1.5 max-w-sm leading-relaxed">
                  Authenticate Google Calendar using the manager panel on the left to pull your upcoming conferences!
                </p>
              </div>
            ) : events.length > 0 ? (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {events.map((evt) => {
                  const isScheduled = evt.autoJoin;
                  const isThisJoining = joiningEventId === evt.id;

                  return (
                    <div 
                      key={evt.id}
                      className={`gsi-event-row border p-4.5 rounded-2xl transition-all duration-200 ${
                        isScheduled 
                          ? 'bg-teal-50/40 border-teal-200 shadow-xs' 
                          : 'bg-white border-[#E5E5E1] hover:border-[#71716A]/50'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-[#1A1A1A]">{evt.title}</span>
                            <span className={`text-[8px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${
                              evt.source === 'google' 
                                ? 'bg-blue-50 text-blue-600 border-blue-100' 
                                : 'bg-green-50 text-green-600 border-green-100'
                            }`}>
                              {evt.source === 'google' ? 'Google' : 'Outlook'}
                            </span>

                            {isScheduled && (
                              <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-wider font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200 animate-pulse">
                                <Check className="w-2.5 h-2.5 text-teal-600" />
                                Scheduled
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[10px] text-[#71716A] flex-wrap">
                            <span className="flex items-center gap-1.2">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              {formatEventTime(evt.startTime)}
                            </span>
                            <span className="flex items-center gap-1.2 shrink-0">
                              <Video className="w-3.5 h-3.5 text-[#71716A]" />
                              {evt.platform === 'recording' ? 'No Room Link' : evt.platform.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* DESGN Toggles & Action controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          
                          {/* 1. Toggle Designation Button */}
                          <button
                            onClick={() => handleToggleDesignation(evt)}
                            disabled={isThisJoining}
                            className={`px-3 py-1.5 rounded-xl text-[10px] uppercase font-bold tracking-wider transition cursor-pointer select-none border border-[#E5E5E1] hover:border-[#1A1A1A] bg-white ${
                              isScheduled 
                                ? 'text-red-650' 
                                : 'text-[#71716A] hover:text-[#1A1A1A]'
                            }`}
                          >
                            <span>{isScheduled ? 'Revoke Join' : 'Auto Join'}</span>
                          </button>

                          {/* 2. Run simulation trigger button */}
                          <button
                            onClick={() => handleTriggerBotJoin(evt)}
                            disabled={!!joiningEventId}
                            className={`flex items-center gap-1.2 px-3.5 py-1.5 rounded-xl text-[10px] uppercase font-bold tracking-wider transition cursor-pointer ${
                              isScheduled 
                                ? 'bg-teal-600 hover:bg-teal-700 text-white' 
                                : 'bg-[#1A1A1A] hover:bg-black text-white'
                            } disabled:opacity-40 shadow-xs`}
                          >
                            <Sparkles className="w-3 h-3 text-white" />
                            <span>{isThisJoining ? 'Logging...' : 'Trigger Bot'}</span>
                          </button>
                        </div>

                      </div>

                      {/* Display active bot flow animation */}
                      <AnimatePresence>
                        {isThisJoining && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 pt-3.5 border-t border-[#E5E5E1] text-[10px] text-[#71716A] flex flex-col gap-2.5 overflow-hidden"
                          >
                            <div className="flex items-center gap-2">
                              <RefreshCw className="w-3.5 h-3.5 text-teal-600 animate-spin" />
                              <span className="font-semibold text-teal-800">{joiningStep}</span>
                            </div>
                            <div className="w-full bg-[#E5E5E1]/60 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-teal-600 h-full w-[60%] animate-[pulse_1.5s_infinite] rounded-full" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-12 bg-[#F8F7F4] border border-[#E5E5E1] rounded-2xl">
                <Calendar className="w-8 h-8 text-[#71716A] mb-2" />
                <span className="text-xs font-bold text-[#1A1A1A]">No upcoming meetings synced</span>
                <p className="text-[10px] text-[#71716A] mt-1 max-w-sm">
                  We checked your primary schedules list but couldn't find any upcoming conferences. Try simulated demo connections or add custom events!
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Calendar Disconnect Confirmation Modal */}
      {disconnectingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1a1a1a]/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-[#E5E5E1] rounded-3xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 text-[#1A1A1A] mb-4">
              <div className="p-2 bg-[#F8F7F4] rounded-full text-red-600">
                <Power className="w-5 h-5 animate-pulse" />
              </div>
              <h3 className="font-serif font-semibold text-lg text-[#1A1A1A]">Disconnect Calendar</h3>
            </div>
            
            <p className="text-xs text-[#71716A] mb-6 leading-relaxed">
              Are you sure you want to disconnect your {disconnectingProvider === 'google' ? 'Google' : 'Outlook'} Calendar integration? Under-construction briefs scheduled using this stream will no longer be real-time synchronized to your active workspace feed.
            </p>
            
            <div className="flex items-center justify-end gap-3 font-mono text-[10px] uppercase tracking-wider">
              <button
                onClick={() => setDisconnectingProvider(null)}
                className="px-2.5 py-1.5 border border-[#E5E5E1] hover:border-[#1A1A1A] text-[#71716A] hover:text-[#1A1A1A] rounded-xl transition-all duration-150 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => executeDisconnect(disconnectingProvider)}
                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-150 font-semibold cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
