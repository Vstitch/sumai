import React, { useState, useEffect } from 'react';
import { 
  Plus, Video, Users, CheckSquare, Search, MessageSquare, Layers, Sparkles, Filter, RefreshCw, Eye,
  Chrome, Download, Copy, Check, LogOut, Laptop, HelpCircle, Trash2, Calendar
} from 'lucide-react';
import { Meeting, ReportTemplate } from './types';
import DashboardStats from './components/DashboardStats';
import MeetingCard from './components/MeetingCard';
import MeetingDetails from './components/MeetingDetails';
import NewMeetingModal from './components/NewMeetingModal';
import MeetingMemorySearch from './components/MeetingMemorySearch';
import AuthScreen from './components/AuthScreen';
import CalendarSyncCenter from './components/CalendarSyncCenter';
import { auth } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { 
  EXT_MANIFEST, EXT_BACKGROUND, EXT_HTML, EXT_JS, EXT_RECORDER_HTML, EXT_RECORDER_JS 
} from './extension_assets';
import { createStoreZip } from './zipHelper';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(true);
  
  // Extension Center
  const [showExtensionCenter, setShowExtensionCenter] = useState(false);
  const [showCalendarCenter, setShowCalendarCenter] = useState(false);
  const [activeExtTab, setActiveExtTab] = useState<'manifest' | 'background' | 'html' | 'js' | 'rec_html' | 'rec_js'>('manifest');
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);

  // Filter and searches
  const [filter, setFilter] = useState<ReportTemplate | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [meetingToDeleteId, setMeetingToDeleteId] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Monitor Authentication state
  useEffect(() => {
    const savedOfflineUser = localStorage.getItem('rez_offline_user');
    if (savedOfflineUser) {
      setUser(JSON.parse(savedOfflineUser) as any);
      setIsAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch all meetings from full-stack backend
  const fetchMeetings = async (selectIdAfterLoad?: string, overrideUserUid?: string) => {
    const uid = overrideUserUid || user?.uid;
    if (!uid) return;
    
    try {
      setIsLoadingList(true);
      const response = await fetch(`/api/meetings?userId=${uid}`);
      if (response.ok) {
        const data: Meeting[] = await response.json();
        setMeetings(data);
        
        // Auto select or maintain pointer
        if (selectIdAfterLoad) {
          const matched = data.find(m => m.id === selectIdAfterLoad);
          if (matched) setSelectedMeeting(matched);
        } else if (data.length > 0 && !selectedMeeting) {
          // Default select first item
          setSelectedMeeting(data[0]);
        } else if (data.length === 0) {
          setSelectedMeeting(null);
        }
      }
    } catch (err) {
      console.error("Failed pulling meetings list from Express API:", err);
    } finally {
      setIsLoadingList(false);
    }
  };

  // Trigger loading when user successfully signs in
  useEffect(() => {
    if (user) {
      fetchMeetings(undefined, user.uid);
    } else {
      setMeetings([]);
      setSelectedMeeting(null);
    }
  }, [user]);

  // background polling handler: If any meeting is in 'processing' status, poll server
  useEffect(() => {
    if (!user) return;
    const hasProcessing = meetings.some(m => m.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchMeetings(selectedMeeting?.id);
    }, 3000);

    return () => clearInterval(interval);
  }, [meetings, selectedMeeting, user]);

  // Handle action item status updates
  const handleToggleAction = async (meetingId: string, actionId: string) => {
    try {
      const response = await fetch(`/api/meetings/${meetingId}/actions/${actionId}/toggle`, {
        method: 'POST'
      });
      if (response.ok) {
        const updatedMeeting: Meeting = await response.json();
        
        // Refresh items inside meetings arrays
        setMeetings(prev => prev.map(m => m.id === meetingId ? updatedMeeting : m));
        
        // Update detail screen state
        if (selectedMeeting && selectedMeeting.id === meetingId) {
          setSelectedMeeting(updatedMeeting);
        }
      }
    } catch (err) {
      console.error("Action toggle failure:", err);
    }
  };

  // Remove meeting with custom React state flow
  const handleDeleteMeeting = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMeetingToDeleteId(id);
  };

  const handleConfirmDelete = async () => {
    if (!meetingToDeleteId) return;
    try {
      const response = await fetch(`/api/meetings/${meetingToDeleteId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setMeetings(prev => prev.filter(m => m.id !== meetingToDeleteId));
        if (selectedMeeting && selectedMeeting.id === meetingToDeleteId) {
          setSelectedMeeting(null);
        }
      }
    } catch (err) {
      console.error("Delete meeting failed:", err);
    } finally {
      setMeetingToDeleteId(null);
    }
  };

  const handleMeetingCreated = (newMeeting: Meeting) => {
    setMeetings(prev => [newMeeting, ...prev]);
    setSelectedMeeting(newMeeting);
  };

  // Direct ID binding for Search matched results
  const handleSelectMatchedMeeting = (id: string) => {
    const matched = meetings.find(m => m.id === id);
    if (matched) {
      setSelectedMeeting(matched);
      // scroll detail pane into view
      const detailPane = document.getElementById('rez_active_workspace_pane');
      detailPane?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Copy wrapper Utility
  const handleCopy = (filename: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  // Copy User UID
  const handleCopyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  // Download individual file client-side (no server zipping complexity needed!)
  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Trigger downloading of all three extension companion files
  const handleDownloadFullPack = () => {
    try {
      const zipBlob = createStoreZip([
        { name: 'manifest.json', content: EXT_MANIFEST },
        { name: 'background.js', content: EXT_BACKGROUND },
        { name: 'popup.html', content: EXT_HTML },
        { name: 'popup.js', content: EXT_JS },
        { name: 'recorder.html', content: EXT_RECORDER_HTML },
        { name: 'recorder.js', content: EXT_RECORDER_JS }
      ]);
      
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rez-companion-extension.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert("REZ AI Companion Extension downloaded successfully as 'rez-companion-extension.zip'!\n\n1. Unzip the file to a folder (e.g. 'rez-companion').\n2. Open 'chrome://extensions' in Chrome.\n3. Turn on 'Developer mode' (toggle in the top-right corner).\n4. Click 'Load unpacked' (button in the top-left corner) and select your extracted folder.");
    } catch (err: any) {
      console.error("ZIP packaging failed:", err);
      alert("ZIP packaging failed, falling back to multi-file download...");
      handleDownloadFile('manifest.json', EXT_MANIFEST);
      handleDownloadFile('background.js', EXT_BACKGROUND);
      handleDownloadFile('popup.html', EXT_HTML);
      handleDownloadFile('popup.js', EXT_JS);
      handleDownloadFile('recorder.html', EXT_RECORDER_HTML);
      handleDownloadFile('recorder.js', EXT_RECORDER_JS);
    }
  };

  // Log Out Handler
  const handleSignOut = () => {
    setShowSignOutConfirm(true);
  };

  const handleConfirmSignOut = async () => {
    setShowSignOutConfirm(false);
    try {
      localStorage.removeItem('rez_offline_user');
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error("Sign out fail:", err);
      setUser(null);
    }
  };

  // Initializing state spinner
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex flex-col items-center justify-center p-6 text-center">
        <RefreshCw className="w-6 h-6 animate-spin text-[#1A1A1A] mb-3" />
        <span className="text-[10px] uppercase font-bold tracking-widest text-[#71716A]">REZ AI Bootloader...</span>
      </div>
    );
  }

  // Auth Guard
  if (!user) {
    return <AuthScreen onAuthSuccess={(bypassUser) => {
      if (bypassUser) {
        setUser(bypassUser);
      }
    }} />;
  }

  // List filtering
  const filteredMeetings = meetings.filter(item => {
    const isCategoryMatch = filter === 'all' || item.template === filter;
    const isSearchMatch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.transcript.some(t => t.text.toLowerCase().includes(searchTerm.toLowerCase()));
    return isCategoryMatch && isSearchMatch;
  });

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#1A1A1A] font-sans selection:bg-[#1A1A1A]/10 selection:text-[#1A1A1A] flex flex-col antialiased">
      
      {/* 1. BRAND NAVIGATION HEADER */}
      <header className="border-b border-[#E5E5E1] bg-[#F8F7F4]/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4 px-8 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold tracking-tighter text-[#1A1A1A] font-serif">REZ AI</span>
            <div className="h-4 w-px bg-[#E5E5E1]"></div>
            <span className="text-xs font-semibold uppercase tracking-widest text-[#71716A] hidden md:inline">Universal Intelligence</span>
          </div>

          <div className="flex items-center gap-3">
            {/* User Account Capsule */}
            <div className="flex items-center gap-2 bg-white border border-[#E5E5E1] px-3.5 py-1.5 rounded-full shadow-xs">
              <div className="w-4 h-4 rounded-full bg-[#1A1A1A] flex items-center justify-center text-[8px] font-bold text-white uppercase">
                {user.displayName ? user.displayName[0] : (user.email ? user.email[0] : 'U')}
              </div>
              <span className="text-xs font-semibold text-[#1A1A1A] max-w-[110px] truncate">
                {user.displayName || user.email?.split('@')[0]}
              </span>
              <button 
                onClick={handleSignOut}
                title="Disconnect Account Session"
                className="text-[#71716A] hover:text-red-600 transition ml-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Chrome Extension Center Toggle */}
            <button
              onClick={() => {
                setShowExtensionCenter(!showExtensionCenter);
                if (showCalendarCenter) setShowCalendarCenter(false);
              }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full border transition cursor-pointer ${
                showExtensionCenter 
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm' 
                  : 'bg-white text-[#71716A] hover:text-[#1A1A1A] border-[#E5E5E1] hover:border-[#1A1A1A]'
              }`}
            >
              <Chrome className="w-3.5 h-3.5" />
              <span>Companion Ext</span>
            </button>

            {/* Calendar Integration Dashboard Center */}
            <button
              onClick={() => {
                setShowCalendarCenter(!showCalendarCenter);
                if (showExtensionCenter) setShowExtensionCenter(false);
              }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full border transition cursor-pointer ${
                showCalendarCenter 
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm' 
                  : 'bg-white text-[#71716A] hover:text-[#1A1A1A] border-[#E5E5E1] hover:border-[#1A1A1A]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Calendar Sync</span>
            </button>

            {/* Collapse Memory explorer button */}
            <button
              onClick={() => setIsSearchVisible(!isSearchVisible)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full border transition cursor-pointer ${
                isSearchVisible 
                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' 
                  : 'bg-white text-[#71716A] hover:text-[#1A1A1A] border-[#E5E5E1] hover:border-[#1A1A1A]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>

            {/* Ingest caller */}
            <button
              id="btn_open_ingest_modal"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 bg-[#1A1A1A] hover:bg-black text-white px-5 py-2 rounded-full text-xs font-medium shadow-sm transition active:scale-98 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>New Ingest</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. BODY SCROLLER CONTAINER */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8 flex flex-col min-h-0">
        
        {/* UNIVERSAL CALENDAR SYNC PORTAL */}
        {showCalendarCenter && (
          <CalendarSyncCenter 
            onClose={() => setShowCalendarCenter(false)}
            onMeetingCreated={(newMeeting) => {
              fetchMeetings(newMeeting.id);
            }}
          />
        )}

        {/* CHROME EXTENSION COMPANION OVERVIEW PANEL */}
        {showExtensionCenter && (
          <div className="mb-8 bg-white border border-[#E5E5E1] rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden animate-fade-in">
            <div className="absolute top-0 right-0 left-0 h-1 bg-amber-500" />
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#E5E5E1] pb-6 mb-6">
              <div>
                <span className="text-[9px] uppercase font-bold tracking-widest text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">Developer Tools</span>
                <h2 className="text-2xl font-bold tracking-tight text-[#1A1A1A] font-serif mt-2">Chrome Extension Developer Center</h2>
                <p className="text-xs text-[#71716A] mt-1 max-w-2xl leading-relaxed">
                  Record tab feeds or system audio directly from Google Meet, Zoom, or Teams tabs. The captured audio sequence gets processed by server-side Gemini intelligence and files automatically into your account workspace dashboard.
                </p>
              </div>

              <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
                <button
                  onClick={handleDownloadFullPack}
                  className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Extension Files (Pack)</span>
                </button>
                <div className="text-[10px] text-[#71716A] text-center">Downloads manifest.json, background.js, popup.html, popup.js, recorder.html and recorder.js</div>
              </div>
            </div>

            {/* Grid showing User Configuration parameters for integration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-[#F8F7F4] border border-[#E5E5E1] p-5 rounded-2xl">
              <div>
                <h4 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider mb-2">Sync Parameters</h4>
                <p className="text-xs text-[#71716A] leading-relaxed mb-4">
                  Deploying the extension requires configuring these parameters within the popup to correctly hook into your active workspace and user account.
                </p>
              </div>

              <div className="space-y-3.5">
                {/* Server Target URL */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-[#71716A]">Workspace Target URL</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={window.location.origin}
                      className="w-full bg-white border border-[#E5E5E1] rounded-lg px-3 py-1.5 text-xs text-[#1A1A1A] font-mono focus:outline-none"
                    />
                    <button
                      onClick={() => handleCopy('URL', window.location.origin)}
                      className="p-1.5 rounded-lg bg-white border border-[#E5E5E1] text-[#71716A] hover:bg-[#F8F7F4] hover:text-[#1A1A1A] transition shrink-0"
                    >
                      {copiedFile === 'URL' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Secure Auth UID */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-[#71716A]">Your Account User UID</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={user.uid}
                      className="w-full bg-white border border-[#E5E5E1] rounded-lg px-3 py-1.5 text-xs text-[#1A1A1A] font-mono focus:outline-none"
                    />
                    <button
                      onClick={handleCopyUid}
                      className="p-1.5 rounded-lg bg-white border border-[#E5E5E1] text-[#71716A] hover:bg-[#F8F7F4] hover:text-[#1A1A1A] transition shrink-0"
                    >
                      {copiedUid ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Code browser */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5E5E1] pb-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#71716A]">Source Files Inspector</span>
                
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setActiveExtTab('manifest')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition ${activeExtTab === 'manifest' ? 'bg-[#1A1A1A] text-white' : 'text-[#71716A] hover:text-[#1A1A1A]'}`}
                  >
                    manifest.json
                  </button>
                  <button
                    onClick={() => setActiveExtTab('background')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition ${activeExtTab === 'background' ? 'bg-[#1A1A1A] text-white' : 'text-[#71716A] hover:text-[#1A1A1A]'}`}
                  >
                    background.js
                  </button>
                  <button
                    onClick={() => setActiveExtTab('html')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition ${activeExtTab === 'html' ? 'bg-[#1A1A1A] text-white' : 'text-[#71716A] hover:text-[#1A1A1A]'}`}
                  >
                    popup.html
                  </button>
                  <button
                    onClick={() => setActiveExtTab('js')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition ${activeExtTab === 'js' ? 'bg-[#1A1A1A] text-white' : 'text-[#71716A] hover:text-[#1A1A1A]'}`}
                  >
                    popup.js
                  </button>
                  <button
                    onClick={() => setActiveExtTab('rec_html')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition ${activeExtTab === 'rec_html' ? 'bg-[#1A1A1A] text-white' : 'text-[#71716A] hover:text-[#1A1A1A]'}`}
                  >
                    recorder.html
                  </button>
                  <button
                    onClick={() => setActiveExtTab('rec_js')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition ${activeExtTab === 'rec_js' ? 'bg-[#1A1A1A] text-white' : 'text-[#71716A] hover:text-[#1A1A1A]'}`}
                  >
                    recorder.js
                  </button>
                </div>
              </div>

              {/* Manifest Code View */}
              {activeExtTab === 'manifest' && (
                <div className="relative">
                  <pre className="p-4 bg-[#F8F7F4] border border-[#E5E5E1] rounded-xl text-[11px] font-mono text-[#1A1A1A] overflow-x-auto max-h-[250px]">
                    {EXT_MANIFEST}
                  </pre>
                  <button
                    onClick={() => handleCopy('manifest.json', EXT_MANIFEST)}
                    className="absolute top-3 right-3 text-xs font-medium text-[#71716A] bg-white border border-[#E5E5E1] hover:border-[#1A1A1A] px-2.5 py-1 rounded-md transition flex items-center gap-1"
                  >
                    {copiedFile === 'manifest.json' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedFile === 'manifest.json' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {/* Background Code View */}
              {activeExtTab === 'background' && (
                <div className="relative">
                  <pre className="p-4 bg-[#F8F7F4] border border-[#E5E5E1] rounded-xl text-[11px] font-mono text-[#1A1A1A] overflow-x-auto max-h-[250px]">
                    {EXT_BACKGROUND}
                  </pre>
                  <button
                    onClick={() => handleCopy('background.js', EXT_BACKGROUND)}
                    className="absolute top-3 right-3 text-xs font-medium text-[#71716A] bg-white border border-[#E5E5E1] hover:border-[#1A1A1A] px-2.5 py-1 rounded-md transition flex items-center gap-1"
                  >
                    {copiedFile === 'background.js' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedFile === 'background.js' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {/* HTML Code View */}
              {activeExtTab === 'html' && (
                <div className="relative">
                  <pre className="p-4 bg-[#F8F7F4] border border-[#E5E5E1] rounded-xl text-[11px] font-mono text-[#1A1A1A] overflow-x-auto max-h-[250px]">
                    {EXT_HTML}
                  </pre>
                  <button
                    onClick={() => handleCopy('popup.html', EXT_HTML)}
                    className="absolute top-3 right-3 text-xs font-medium text-[#71716A] bg-white border border-[#E5E5E1] hover:border-[#1A1A1A] px-2.5 py-1 rounded-md transition flex items-center gap-1"
                  >
                    {copiedFile === 'popup.html' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedFile === 'popup.html' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {/* JS Code View */}
              {activeExtTab === 'js' && (
                <div className="relative">
                  <pre className="p-4 bg-[#F8F7F4] border border-[#E5E5E1] rounded-xl text-[11px] font-mono text-[#1A1A1A] overflow-x-auto max-h-[250px]">
                    {EXT_JS}
                  </pre>
                  <button
                    onClick={() => handleCopy('popup.js', EXT_JS)}
                    className="absolute top-3 right-3 text-xs font-medium text-[#71716A] bg-white border border-[#E5E5E1] hover:border-[#1A1A1A] px-2.5 py-1 rounded-md transition flex items-center gap-1"
                  >
                    {copiedFile === 'popup.js' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedFile === 'popup.js' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {/* Recorder HTML Code View */}
              {activeExtTab === 'rec_html' && (
                <div className="relative">
                  <pre className="p-4 bg-[#F8F7F4] border border-[#E5E5E1] rounded-xl text-[11px] font-mono text-[#1A1A1A] overflow-x-auto max-h-[250px]">
                    {EXT_RECORDER_HTML}
                  </pre>
                  <button
                    onClick={() => handleCopy('recorder.html', EXT_RECORDER_HTML)}
                    className="absolute top-3 right-3 text-xs font-medium text-[#71716A] bg-white border border-[#E5E5E1] hover:border-[#1A1A1A] px-2.5 py-1 rounded-md transition flex items-center gap-1"
                  >
                    {copiedFile === 'recorder.html' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedFile === 'recorder.html' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {/* Recorder JS Code View */}
              {activeExtTab === 'rec_js' && (
                <div className="relative">
                  <pre className="p-4 bg-[#F8F7F4] border border-[#E5E5E1] rounded-xl text-[11px] font-mono text-[#1A1A1A] overflow-x-auto max-h-[250px]">
                    {EXT_RECORDER_JS}
                  </pre>
                  <button
                    onClick={() => handleCopy('recorder.js', EXT_RECORDER_JS)}
                    className="absolute top-3 right-3 text-xs font-medium text-[#71716A] bg-white border border-[#E5E5E1] hover:border-[#1A1A1A] px-2.5 py-1 rounded-md transition flex items-center gap-1"
                  >
                    {copiedFile === 'recorder.js' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedFile === 'recorder.js' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Close action */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowExtensionCenter(false)}
                className="px-4 py-1.5 rounded-lg border border-[#E5E5E1] text-xs font-medium text-[#71716A] hover:text-[#1A1A1A] transition cursor-pointer"
              >
                Close Integration Center
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Cognitive Intelligence memory section */}
        {isSearchVisible && (
          <MeetingMemorySearch onSelectMeeting={handleSelectMatchedMeeting} />
        )}

        {/* Aggregate metrics dashboards */}
        <DashboardStats meetings={meetings} />

        {/* WORKSPACE AREA: Split Screen */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-[500px]">
          
          {/* LEFT SPLIT: Logs list and tools (Span 4) */}
          <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
            
            {/* Title summary counters */}
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] uppercase font-bold text-[#71716A] tracking-[0.2em] flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-[#71716A]" />
                <span>Recent Intelligence</span>
              </h3>
              <span className="text-[10px] font-mono bg-white border border-[#E5E5E1] text-[#71716A] px-2 py-0.5 rounded-full font-bold">
                {filteredMeetings.length} item{filteredMeetings.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Filters panel */}
            <div className="bg-white border border-[#E5E5E1] p-5 rounded-2xl shadow-sm space-y-4">
              
              {/* Keyword searches */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#71716A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="inp_feed_title_search"
                  type="text"
                  placeholder="Search titles or transcripts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#F8F7F4] border border-[#E5E5E1] rounded-xl py-2 pl-9.5 pr-4 text-xs text-[#1A1A1A] placeholder-[#71716A]/70 focus:outline-none focus:border-[#71716A]"
                />
              </div>

              {/* Badged category scrolling row */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 invisible-scrollbar">
                <span className="text-[10px] text-[#71716A] font-bold uppercase tracking-wider shrink-0 mr-1">
                  Filter:
                </span>
                
                <button
                  onClick={() => setFilter('all')}
                  className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded transition-colors shrink-0 cursor-pointer ${
                    filter === 'all' 
                      ? 'bg-[#1A1A1A] text-white' 
                      : 'bg-[#F8F7F4] border border-[#E5E5E1] text-[#71716A] hover:text-[#1A1A1A] hover:bg-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('scrum')}
                  className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded transition-colors shrink-0 cursor-pointer ${
                    filter === 'scrum' 
                      ? 'bg-[#1A1A1A] text-white' 
                      : 'bg-[#F8F7F4] border border-[#E5E5E1] text-[#71716A] hover:text-[#1A1A1A] hover:bg-white'
                  }`}
                >
                  Scrum
                </button>
                <button
                  onClick={() => setFilter('client')}
                  className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded transition-colors shrink-0 cursor-pointer ${
                    filter === 'client' 
                      ? 'bg-[#1A1A1A] text-white' 
                      : 'bg-[#F8F7F4] border border-[#E5E5E1] text-[#71716A] hover:text-[#1A1A1A] hover:bg-white'
                  }`}
                >
                  Client
                </button>
                <button
                  onClick={() => setFilter('interview')}
                  className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded transition-colors shrink-0 cursor-pointer ${
                    filter === 'interview' 
                      ? 'bg-[#1A1A1A] text-white' 
                      : 'bg-[#F8F7F4] border border-[#E5E5E1] text-[#71716A] hover:text-[#1A1A1A] hover:bg-white'
                  }`}
                >
                  Interview
                </button>
                <button
                  onClick={() => setFilter('sales')}
                  className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded transition-colors shrink-0 cursor-pointer ${
                    filter === 'sales' 
                      ? 'bg-[#1A1A1A] text-white' 
                      : 'bg-[#F8F7F4] border border-[#E5E5E1] text-[#71716A] hover:text-[#1A1A1A] hover:bg-white'
                  }`}
                >
                  Sales
                </button>
                <button
                  onClick={() => setFilter('investor')}
                  className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded transition-colors shrink-0 cursor-pointer ${
                    filter === 'investor' 
                      ? 'bg-[#1A1A1A] text-white' 
                      : 'bg-[#F8F7F4] border border-[#E5E5E1] text-[#71716A] hover:text-[#1A1A1A] hover:bg-white'
                  }`}
                >
                  Investor
                </button>
              </div>

            </div>

            {/* List panel feed */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[calc(100vh-220px)] lg:max-h-none">
              {isLoadingList ? (
                <div className="text-center py-10 bg-white border border-[#E5E5E1] rounded-2xl animate-pulse flex flex-col items-center justify-center shadow-sm">
                  <RefreshCw className="w-5 h-5 text-[#1A1A1A] animate-spin mb-2" />
                  <span className="text-[#1A1A1A] text-xs font-medium">Accessing intelligence repository...</span>
                </div>
              ) : filteredMeetings.length > 0 ? (
                filteredMeetings.map((item) => (
                  <MeetingCard
                    key={item.id}
                    meeting={item}
                    isSelected={selectedMeeting?.id === item.id}
                    onSelect={(meet) => setSelectedMeeting(meet)}
                    onDelete={handleDeleteMeeting}
                  />
                ))
              ) : (
                <div className="text-center py-12 bg-white border border-[#E5E5E1] rounded-2xl p-6 shadow-sm">
                  <p className="text-[#1A1A1A] text-xs font-semibold">No recorded intelligence matched</p>
                  <p className="text-[#71716A] text-[10px] mt-1 leading-normal">Refine search text or click "New Ingest" to start simulate long conversations or configure your Chrome Extension companion!</p>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SPLIT: Selected detail workspace content tabs (Span 8) */}
          <div id="rez_active_workspace_pane" className="lg:col-span-8 h-full min-h-[400px]">
            {selectedMeeting ? (
              <MeetingDetails
                meeting={selectedMeeting}
                onToggleAction={handleToggleAction}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-white border border-[#E5E5E1] rounded-3xl min-h-[400px] shadow-sm">
                <Sparkles className="w-8 h-8 text-[#1A1A1A] mb-4 animate-pulse" />
                <h3 className="text-[#1A1A1A] font-serif font-light text-2xl mb-2">REZ AI Terminal</h3>
                <p className="text-[#71716A] text-xs max-w-sm leading-relaxed">No conversation selected. Unpack archived transcripts, executive decisions, and task checklists by choosing a catalog card from the left column.</p>
              </div>
            )}
          </div>

        </div>

      </main>

      {/* 3. MODAL OVERLAY PORTAL */}
      {isModalOpen && (
        <NewMeetingModal
          onClose={() => setIsModalOpen(false)}
          onMeetingCreated={handleMeetingCreated}
        />
      )}

      {/* Confirmation Modal to avoid blocking inside Sandbox / iframe */}
      {meetingToDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1a1a1a]/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-[#E5E5E1] rounded-3xl p-6 max-w-sm w-full shadow-xl animate-scale-up">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-2 bg-red-50 rounded-full">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="font-serif font-semibold text-lg text-[#1A1A1A]">Delete Meeting Log</h3>
            </div>
            
            <p className="text-xs text-[#71716A] mb-6 leading-relaxed">
              Are you sure you want to permanently erase this meeting intelligence file? This transaction is irreversible and will remove all generated transcripts, action items, and audit reports.
            </p>
            
            <div className="flex items-center justify-end gap-3 font-mono text-[10px] uppercase tracking-wider">
              <button
                onClick={() => setMeetingToDeleteId(null)}
                className="px-4 py-2 border border-[#E5E5E1] hover:border-[#1A1A1A] text-[#71716A] hover:text-[#1A1A1A] rounded-xl transition-all duration-150 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-150 font-semibold"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Confirmation Modal */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1a1a1a]/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-[#E5E5E1] rounded-3xl p-6 max-w-sm w-full shadow-xl animate-scale-up">
            <div className="flex items-center gap-3 text-[#1A1A1A] mb-4">
              <div className="p-2 bg-[#F8F7F4] rounded-full text-[#1A1A1A]">
                <LogOut className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-semibold text-lg text-[#1A1A1A]">Sign Out</h3>
            </div>
            
            <p className="text-xs text-[#71716A] mb-6 leading-relaxed">
              Disconnect active session and log out of your REZ AI Workspace intelligence account? You will need to sign back in with your credentials or Google Identity to regain access.
            </p>
            
            <div className="flex items-center justify-end gap-3 font-mono text-[10px] uppercase tracking-wider">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="px-4 py-2 border border-[#E5E5E1] hover:border-[#1A1A1A] text-[#71716A] hover:text-[#1A1A1A] rounded-xl transition-all duration-150 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSignOut}
                className="px-4 py-2 bg-[#1A1A1A] hover:bg-black text-white rounded-xl transition-all duration-150 font-semibold"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global minimal footer */}
      <footer className="border-t border-[#E5E5E1] bg-white px-8 py-5 text-center shrink-0 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] font-medium uppercase tracking-widest text-[#71716A]">
          <div className="flex gap-6">
            <span>Compliance: SOC2 Type II</span>
            <span>Memory Status: Indexed</span>
          </div>
          <div>© 2026 REZ AI SYSTEMS INC.</div>
        </div>
      </footer>

    </div>
  );
}
