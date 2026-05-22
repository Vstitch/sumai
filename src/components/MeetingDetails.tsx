import { useState, useEffect, useRef } from 'react';
import { Meeting, ActionItem } from '../types';
import { auth } from '../firebase';
import { 
  FileText, MessageSquare, CheckSquare, Send, Check, Copy, 
  Download, Sparkles, AlertTriangle, Calendar, Clock, Speaker, Search, User,
  Play, Pause, Volume2, ChevronUp, ChevronDown, Monitor, Headphones, AudioLines,
  Maximize2, Activity, Tv2, Sparkle
} from 'lucide-react';

interface MeetingDetailsProps {
  meeting: Meeting;
  onToggleAction: (meetingId: string, actionId: string) => Promise<void>;
}

export default function MeetingDetails({ meeting, onToggleAction }: MeetingDetailsProps) {
  const [activeTab, setActiveTab] = useState<'report' | 'transcript' | 'actions' | 'followup'>('report');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('all');
  const [copies, setCopies] = useState<Record<string, boolean>>({});

  // Real-time Media playback sync states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(meeting.duration || 60);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPlayerCollapsed, setIsPlayerCollapsed] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // References to browser HTMLMediaElement controls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Handle meeting-id change to reset states
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    setMediaDuration(meeting.duration || 60);
    setPlaybackSpeed(1);
    
    // Stop any playing elements
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [meeting.id]);

  // Simulated meetings: clock tick interval (for when there's no native video/audio files)
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    const hasRealMedia = !!(meeting.videoUrl || meeting.audioUrl);

    if (isPlaying && !hasRealMedia) {
      intervalId = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= mediaDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, meeting.videoUrl, meeting.audioUrl, mediaDuration, playbackSpeed]);

  // Synchronize playback rate
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackSpeed;
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed, meeting.id]);

  // Toggle general play / pause helper
  const handleTogglePlay = () => {
    const hasRealMedia = !!(meeting.videoUrl || meeting.audioUrl);
    if (isPlaying) {
      setIsPlaying(false);
      if (videoRef.current) videoRef.current.pause();
      if (audioRef.current) audioRef.current.pause();
    } else {
      setIsPlaying(true);
      if (hasRealMedia) {
        if (meeting.videoUrl && videoRef.current) {
          videoRef.current.play().catch(e => console.warn("Video play error:", e));
        } else if (meeting.audioUrl && audioRef.current) {
          audioRef.current.play().catch(e => console.warn("Audio play error:", e));
        }
      }
    }
  };

  // Skip timeline directly (seeking)
  const handleSeek = (seconds: number) => {
    setCurrentTime(seconds);
    if (videoRef.current) videoRef.current.currentTime = seconds;
    if (audioRef.current) audioRef.current.currentTime = seconds;
  };

  const getSpeakerInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const formatSecs = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Download document reports
  const triggerDownloadMarkdown = () => {
    const reportText = `
# ${meeting.title}
Date: ${new Date(meeting.date).toLocaleString()}
Platform: ${meeting.platform}
Category: ${meeting.template}

## Executive Summary
${meeting.report?.summary || ''}

## Key Decisions
${(meeting.report?.decisions || []).map((d, i) => `${i + 1}. ${d}`).join('\n')}

## Documented Risks & Rollbacks
${(meeting.report?.risks || []).map((r, i) => `- [!] ${r}`).join('\n')}

## Upcoming Actions
${meeting.actionItems.map(a => `- [${a.status === 'completed' ? 'x' : ' '}] ${a.owner}: ${a.task} (${a.deadline})`).join('\n')}
    `;
    const blob = new Blob([reportText], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${meeting.title.replace(/\s+/g, '_')}_intelligence.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Toast clipboard copiers
  const executeClipboardCopy = (key: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopies(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopies(prev => ({ ...prev, [key]: false }));
    }, 2000);
  };

  const speechColors: Record<string, string> = {
    "John": "bg-[#1A1A1A] text-white",
    "Sarah": "bg-blue-600 text-white",
    "Vinitha": "bg-[#E5E5E1] text-[#1A1A1A]",
    "Liam": "bg-amber-600 text-white",
    "Robert": "bg-indigo-600 text-white",
    "Sarah Chen": "bg-blue-600 text-white",
  };

  const getSpeakerColor = (name: string) => {
    const firstWord = name.split(' ')[0];
    return speechColors[firstWord] || "bg-[#1A1A1A] text-white";
  };

  const dialogueChunks = meeting.transcript || [];
  const uniqSpeakers = Array.from(new Set(dialogueChunks.map(c => c.speaker)));

  const filteredDialogue = dialogueChunks.filter(chunk => {
    const speakOk = selectedSpeaker === 'all' || chunk.speaker === selectedSpeaker;
    const searchOk = chunk.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
                     chunk.speaker.toLowerCase().includes(searchTerm.toLowerCase());
    return speakOk && searchOk;
  });

  // Calculate high-fidelity active speaking segment
  const activeChunk = dialogueChunks.find(c => currentTime >= c.start && currentTime <= c.end);
  const activeSpeakerName = activeChunk ? activeChunk.speaker : null;

  // Auto Scroll dynamic sync
  useEffect(() => {
    if (autoScroll && activeChunk) {
      const activeIdx = dialogueChunks.indexOf(activeChunk);
      if (activeIdx !== -1) {
        const itemEl = document.getElementById(`transcript-chunk-${activeIdx}`);
        if (itemEl) {
          itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [activeChunk, autoScroll]);

  // Simulation slides mapping based on templates
  const getSimulationSlides = (template: string) => {
    switch (template) {
      case 'scrum':
        return [
          { time: 0, title: "Sprint Scrum Board: Velocity Metrics Review", items: ["Story Points completed: 48 / 60", "Velocity Target: 100% precision threshold", "Blockers prioritized: 2 database logs"] },
          { time: 10, title: "Infrastructure Bottle-necks & SRE Logs", content: "Liam flagging connection timeout parameters on high traffic socket tests. Sarah scheduling task parameters update." },
          { time: 23, title: "Daily Target Review & Backlog Grooming", items: ["Client checkout flow validation", "Gemini analytics response testing", "Stripe key lazified parameters validation"] }
        ];
      case 'client':
        return [
          { time: 0, title: "REZ AI platform walk-through & feature sandbox", items: ["Dynamic indexing of historical briefs", "Automated Slack executive broadcasts", "Chrome Companion audio recordings"] },
          { time: 10, title: "Systems Integration, CORS Origins & OAuth TLS", content: "Client security reviews. Confirming offline backups are saved with double encrypted vault files. Vinitha approving timeline." },
          { time: 23, title: "Target deadlines & next contract checkpoints", items: ["Draft backup strategy: Thursday 5 PM", "CORS sandboxing trial setup: Friday", "Client Review session: Tuesday 10 AM"] }
        ];
      case 'interview':
        return [
          { time: 0, title: "Technical Scoping & Systems Architecture", items: ["Load balancer metrics routing logic", "NoSQL read replicator parameters optimization", "Write-heavy caching strategy"] },
          { time: 10, title: "Code Arena: Optimal algorithmic coding trial", content: "Candidate writing JS stream chunking array intervals logic. Candidate achieves linear performance with smart pointer offsets." },
          { time: 23, title: "Final Q&A and Team Culture Alignment", items: ["Full-stack deployment cycles review", "High engineer autonomy core metrics", "Staged automated testing pipelines"] }
        ];
      case 'sales':
        return [
          { time: 0, title: "REZ AI Platform Capabilities walkthrough", items: ["Cognitive index matching accuracy limits", "Diarized conversational models walkthrough", "Automated reports and agendas pipeline"] },
          { time: 10, title: "Pricing structure & dedicated support SLAs", content: "SaaS Enterprise tier presentation with multi-user workspace accounts support. SLA parameters matching SOC2 criteria." },
          { time: 23, title: "Setup timeline & account setup plan", items: ["Standard sandbox provisioning: 2 hours", "Security compliance files delivery", "Kickoff session proposal"] }
        ];
      default:
        return [
          { time: 0, title: "Executive board briefing overview deck", items: ["Annual ARR trajectory goals model", "Operational context retention ratios", "Fundraising round goals framework"] },
          { time: 10, title: "Technological advantages & proprietary models", content: "Dynamic context synchronization structures and chrome-companion audio recorders maximizing high-fidelity transcript yields." },
          { time: 23, title: "Compliance boundaries & next round timeline", items: ["SOC-2 Type II audits completion: Q2", "Targeting Seed round commit: next week", "Product roadmap rollout"] }
        ];
    }
  };

  const simulationSlides = getSimulationSlides(meeting.template);
  const activeSlide = [...simulationSlides].reverse().find(s => currentTime >= s.time) || simulationSlides[0];

  // Dynamic accurate participants derived directly from the real conversation transcript
  const getMeetingParticipants = () => {
    const list: Array<{ name: string; avatar: string; role: string }> = [];
    const speakerSet = new Set<string>();

    if (meeting.transcript && meeting.transcript.length > 0) {
      meeting.transcript.forEach(chunk => {
        if (chunk.speaker) {
          speakerSet.add(chunk.speaker.trim());
        }
      });
    }

    const uniqueSpeakers = Array.from(speakerSet);

    if (uniqueSpeakers.length > 0) {
      uniqueSpeakers.forEach((speaker, index) => {
        // Compute avatar initials
        const cleanName = speaker.replace(/^(Speaker \d+|Speaker [A-Z])$/i, '').trim();
        let initials = 'SP';
        if (cleanName) {
          initials = cleanName.split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2);
        } else {
          initials = speaker.split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'SP';
        }

        // Determine a clean role based on standard participation
        let role = 'Speaker';
        if (index === 0) {
          role = 'Lead Speaker';
        } else if (index === 1) {
          role = 'Active Speaker';
        } else {
          role = 'Participant';
        }

        list.push({
          name: speaker,
          avatar: initials,
          role: role
        });
      });
    }

    // Always ensure the user/Me is present in the list using the authentic email or Vinitha Ramesh
    const userEmail = auth.currentUser?.email || "vinitharameshchand@gmail.com";
    const userHandle = userEmail.split('@')[0];
    let userFullName = 'Vinitha Ramesh'; // sensible fallback based on user's email
    if (userHandle.includes('vinitharamesh')) {
      userFullName = 'Vinitha Ramesh';
    } else {
      userFullName = userHandle.charAt(0).toUpperCase() + userHandle.slice(1);
    }

    // Check if the user is already representing one of the speakers (e.g. if speaker contains "you" or "me" or user's name)
    const alreadyHasUser = list.some(p => 
      p.name.toLowerCase().includes('you') || 
      p.name.toLowerCase().includes('me') || 
      p.name.toLowerCase().includes(userFullName.toLowerCase())
    );

    if (!alreadyHasUser) {
      list.push({
        name: `${userFullName} (You)`,
        avatar: 'VR',
        role: 'Organizer / Host'
      });
    }

    return list;
  };

  const meetingParticipants = getMeetingParticipants();

  // Markdown renderer
  function renderMarkdown(markdown: string) {
    if (!markdown) return null;
    const lines = markdown.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-[#1A1A1A] font-serif font-bold text-sm uppercase tracking-wider mb-2 mt-4 first:mt-0">{line.replace('### ', '')}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-[#1A1A1A] font-serif font-bold text-lg mb-3 mt-5 first:mt-0">{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-[#1A1A1A] font-serif font-extrabold text-xl mb-4 mt-6 first:mt-0">{line.replace('# ', '')}</h1>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={idx} className="text-[#1A1A1A] text-sm list-disc ml-5 mb-2 leading-relaxed">
            {formatInlineText(line.substring(2))}
          </li>
        );
      }
      if (!line.trim()) return <div key={idx} className="h-2" />;
      return <p key={idx} className="text-[#1A1A1A] text-sm leading-relaxed mb-3">{formatInlineText(line)}</p>;
    });
  }

  function formatInlineText(text: string) {
    const boldPattern = /\*\*(.*?)\*\*/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = boldPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push(<strong key={match.index} className="text-[#1A1A1A] font-bold">{match[1]}</strong>);
      lastIndex = boldPattern.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  }

  return (
    <div className="bg-white border border-[#E5E5E1] rounded-2xl overflow-hidden shadow-sm flex flex-col h-[calc(100vh-180px)]">
      
      {/* 1. HEADER PROFILE CARD */}
      <div className="p-6 bg-white border-b border-[#E5E5E1] shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[10px] bg-[#F8F7F4] border border-[#E5E5E1] text-[#71716A] font-semibold uppercase tracking-wider px-2 py-0.5 rounded">
                {meeting.template}
              </span>
              {meeting.translated && (
                <>
                  <span className="text-[#E5E5E1] font-mono text-[10px]">•</span>
                  <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-0.5" title={`Spoken language: ${meeting.spokenLanguage || 'auto'}`}>
                    <span>EN TRANSLATED</span>
                    <span className="opacity-75">({meeting.spokenLanguage === 'auto' ? 'AUTO' : meeting.spokenLanguage.toUpperCase()})</span>
                  </span>
                </>
              )}
              <span className="text-[#E5E5E1] font-mono text-[10px]">•</span>
              <span className="text-[11px] text-[#71716A] flex items-center gap-1 font-medium bg-[#F8F7F4] px-2 py-0.5 rounded border border-[#E5E5E1]">
                <Calendar className="w-3 h-3 text-[#71716A]" />
                {new Date(meeting.date).toLocaleDateString('en-US', { dateStyle: 'medium' })}
              </span>
              <span className="text-[11px] text-[#71716A] flex items-center gap-1 font-mono bg-[#F8F7F4] px-2 py-0.5 rounded border border-[#E5E5E1]">
                <Clock className="w-3 h-3 text-[#71716A]" />
                {formatSecs(currentTime)} / {formatSecs(mediaDuration)}
              </span>
              {isPlaying && (
                <span className="text-[9px] text-[#22C55E] flex items-center gap-1.5 font-bold uppercase tracking-wider ml-1 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                  Streaming Playback
                </span>
              )}
            </div>
            <h2 className="text-xl font-serif font-bold text-[#1A1A1A] tracking-tight leading-snug">{meeting.title}</h2>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn_export_markdown"
              onClick={triggerDownloadMarkdown}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#1A1A1A] hover:bg-black text-white rounded-full transition-all duration-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-white" />
              <span>Export .MD</span>
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 mt-5 bg-[#F8F7F4] p-1 rounded-full border border-[#E5E5E1] w-fit">
          <button
            id="tab_opt_report"
            onClick={() => setActiveTab('report')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'report' 
                ? 'bg-white text-[#1A1A1A] shadow-sm border border-[#E5E5E1]' 
                : 'text-[#71716A] hover:text-[#1A1A1A] hover:bg-white/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Structured Intelligence</span>
          </button>
          <button
            id="tab_opt_transcript"
            onClick={() => setActiveTab('transcript')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'transcript' 
                ? 'bg-white text-[#1A1A1A] shadow-sm border border-[#E5E5E1]' 
                : 'text-[#71716A] hover:text-[#1A1A1A] hover:bg-white/50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Dialogue Transcript</span>
          </button>
          <button
            id="tab_opt_actions"
            onClick={() => setActiveTab('actions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 relative cursor-pointer ${
              activeTab === 'actions' 
                ? 'bg-white text-[#1A1A1A] shadow-sm border border-[#E5E5E1]' 
                : 'text-[#71716A] hover:text-[#1A1A1A] hover:bg-white/50'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Action Items</span>
            {meeting.actionItems.filter(a => a.status === 'pending').length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1A1A1A] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1A1A1A]"></span>
              </span>
            )}
          </button>
          <button
            id="tab_opt_followup"
            onClick={() => setActiveTab('followup')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'followup' 
                ? 'bg-white text-[#1A1A1A] shadow-sm border border-[#E5E5E1]' 
                : 'text-[#71716A] hover:text-[#1A1A1A] hover:bg-white/50'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>AI Follow-Up</span>
          </button>
        </div>
      </div>

      {/* 2. HIGH ACCURACY STREAMING MEDIA PLAYER DRAWER */}
      <div className="bg-[#1A1A1A] text-white shrink-0 border-b border-[#2C2C2A] overflow-hidden flex flex-col relative transition-all duration-300">
        
        {/* Header Drawer handle */}
        <div 
          onClick={() => setIsPlayerCollapsed(!isPlayerCollapsed)}
          className="px-6 py-2.5 bg-[#1E1E1C] hover:bg-[#282826] cursor-pointer flex items-center justify-between transition-colors select-none"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-[#A1A19A] tracking-wider uppercase">
            <Monitor className="w-4 h-4 text-[#A1A19A]" />
            <span>Meeting Companion Screen & Audio Recording</span>
            <span className="text-[10px] bg-[#2C2C2A] text-[#F3F4F6] border border-[#3A3A37] px-2 py-0.5 rounded font-mono">
              {meeting.videoUrl || meeting.hasVideo ? 'SCREEN CAPTURE ACTIVE' : 'VOICE STREAM CAPTURE'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-[10px] font-mono text-[#A1A19A]">
              TIME: {formatSecs(currentTime)} / {formatSecs(mediaDuration)}
            </div>
            <button className="text-[#A1A19A] hover:text-white transition">
              {isPlayerCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Collapsible Sandbox Player */}
        {!isPlayerCollapsed && (
          <div className="p-5 flex flex-col gap-4 animate-fade-in">
            
            {/* Grid Split Content */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              
              {/* PRIMARY SCREEN CAPTURE STIMULUS CONTAINER (Col Span 8) */}
              <div className="md:col-span-8 bg-[#0D0D0C] rounded-2xl border border-[#2C2C2A] overflow-hidden h-[240px] flex flex-col relative group/screen">
                
                {/* Real Recording Player View */}
                {meeting.videoUrl ? (
                  <div className="w-full h-full bg-black flex items-center justify-center">
                    <video
                      ref={videoRef}
                      src={meeting.videoUrl}
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                      onDurationChange={(e) => setMediaDuration(e.currentTarget.duration)}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      className="w-full h-full object-contain"
                      id="meeting-video-element"
                      preload="auto"
                    />
                  </div>
                ) : meeting.audioUrl ? (
                  <div className="w-full h-full bg-black flex flex-col items-center justify-center px-8 text-center relative">
                    <Headphones className={`w-12 h-12 text-[#71716A] mb-3 ${isPlaying ? 'animate-bounce text-amber-500' : ''}`} />
                    <h4 className="text-sm font-semibold tracking-wide">Rez Voice Broadcast Feed</h4>
                    <p className="text-[11px] text-[#71716A] mt-1 max-w-sm">The client companion was recorded as a voice feed. Full speaker-diarized transcripts are matching timeline controls below.</p>
                    <div className="absolute bottom-5 left-5 right-5 h-8 flex items-center justify-center gap-1.5 select-none">
                      <AudioLines className={`w-16 h-4 text-[#444] ${isPlaying ? 'text-amber-500' : ''}`} />
                    </div>
                    <audio
                      ref={audioRef}
                      src={meeting.audioUrl}
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                      onDurationChange={(e) => setMediaDuration(e.currentTarget.duration)}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      id="meeting-audio-element"
                      preload="auto"
                    />
                  </div>
                ) : (
                  // BEAUTIFUL INTERACTIVE PLAYGROUND FOR SIMULATED MEETINGS
                  <div className="w-full h-full flex flex-col justify-between bg-[#111110] p-4 text-white font-sans relative select-none">
                    
                    {/* Header bar of simulation screen share */}
                    <div className="flex items-center justify-between border-b border-[#2C2C2A] pb-2 text-[10px] text-[#71716A] shrink-0 font-medium tracking-wide">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        <span>MOCK SCREENSHARE CONSOLE</span>
                      </div>
                      <span className="font-mono">{meeting.platform.toUpperCase()} MEETING ROOM</span>
                    </div>

                    {/* Simulation Slide Board */}
                    <div className="flex-1 my-3 flex flex-col justify-center items-center text-center px-4 animate-fade-in">
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4 w-full max-w-md shadow-lg backdrop-blur-xs">
                        <h5 className="text-[10px] font-bold uppercase tracking-widest text-[#A1A19A] flex items-center justify-center gap-1.5 mb-1">
                          <Tv2 className="w-3.5 h-3.5 text-amber-500" />
                          {activeSlide.title}
                        </h5>
                        
                        {activeSlide.items ? (
                          <ul className="text-xs space-y-1.5 mt-3 text-left list-none pl-1">
                            {activeSlide.items.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-1.5 text-slate-300">
                                <span className="text-amber-500 mt-0.5">•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-300 leading-relaxed text-left mt-3 bg-black/30 p-2.5 rounded-lg border border-white/5 font-mono">
                            {activeSlide.content}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Bottom Status bar */}
                    <div className="flex items-center justify-between text-[9px] text-[#A1A19A] border-t border-[#222] pt-2 shrink-0">
                      <span>PRESENTING: {meetingParticipants.find(p => p.role.toLowerCase().includes("host") || p.role.toLowerCase().includes("speaker") || p.role.toLowerCase().includes("organizer"))?.name || 'Organizer'}</span>
                      <span className="font-mono text-amber-500 font-bold">SLIDE AUTO-PLAY TIMELINE SYNC</span>
                    </div>

                  </div>
                )}
                
                {/* Floating screen indicator for absolute realism */}
                <div className="absolute top-4 right-4 bg-black/70 border border-white/15 rounded px-2.5 py-1 text-[9px] uppercase tracking-widest text-white flex items-center gap-1.5 font-bold z-10 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
                  <span>REC: FULL MEETING</span>
                </div>

              </div>

              {/* ACTIVE CONFERENCE PARTICIPANTS WEBCAM PARKS (Col Span 4) */}
              <div className="md:col-span-4 bg-[#0D0D0C] rounded-2xl border border-[#2C2C2A] p-4 flex flex-col justify-between h-[240px]">
                <div className="text-[10px] font-bold text-[#A1A19A] uppercase tracking-wider mb-2 border-b border-[#2C2C2A] pb-1.5 flex items-center justify-between">
                  <span>CONFERENCE ROOM FEED</span>
                  <span className="text-[8px] tracking-widest font-mono text-amber-500">REALTIME</span>
                </div>

                <div className="grid grid-cols-2 gap-2 flex-1 overflow-y-auto">
                  {meetingParticipants.map((p) => {
                    // Match dialogue chunk to determine if this participant is speaking
                    const isSpeakingNow = isPlaying && activeSpeakerName && (
                      activeSpeakerName.toLowerCase().includes(p.name.split(' ')[0].toLowerCase()) ||
                      p.name.toLowerCase().includes(activeSpeakerName.toLowerCase())
                    );
                    
                    return (
                      <div 
                        key={p.name}
                        className={`rounded-xl border p-2 flex flex-col justify-between relative transition-all duration-300 overflow-hidden bg-[#141413] ${
                          isSpeakingNow 
                            ? 'border-green-500 ring-2 ring-green-500/20 shadow-[0_0_12px_rgba(34,197,94,0.15)] bg-slate-900/40' 
                            : 'border-[#222]'
                        }`}
                      >
                        {/* Speaker Indicator Wave */}
                        {isSpeakingNow && (
                          <div className="absolute inset-0 bg-green-500/5 animate-pulse" />
                        )}

                        <div className="flex items-center gap-2 relative z-10">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold font-mono border ${
                            isSpeakingNow 
                              ? 'bg-green-600 border-green-500 text-white' 
                              : 'bg-zinc-800 border-zinc-700 text-slate-300'
                          }`}>
                            {p.avatar}
                          </div>
                          
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold truncate text-slate-200 leading-tight">{p.name}</p>
                            <p className="text-[8px] text-[#71716A] truncate leading-none mt-0.5">{p.role}</p>
                          </div>
                        </div>

                        {/* Speaker Muted / Talking Status */}
                        <div className="flex justify-end relative z-10">
                          <span className={`text-[8px] font-mono font-bold uppercase px-1 rounded ${
                            isSpeakingNow 
                              ? 'bg-green-500/15 text-green-400 border border-green-500/30' 
                              : 'bg-zinc-800 text-zinc-500'
                          }`}>
                            {isSpeakingNow ? 'Talking ●' : 'Listening'}
                          </span>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* INTEGRATED RECORDING CONTROLS TIMELINE BAR */}
            <div className="bg-[#171716] border border-[#2A2A28] rounded-xl p-3 flex flex-col gap-2.5">
              
              {/* Slider Seek bar bar */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-slate-400">{formatSecs(currentTime)}</span>
                
                <input
                  type="range"
                  min="0"
                  max={mediaDuration || 1}
                  step="0.1"
                  value={currentTime}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="flex-1 accent-amber-500 h-1 bg-zinc-800 cursor-pointer rounded-lg hover:h-1.5 transition-all"
                  style={{
                    background: `linear-gradient(to right, #F59E0B 0%, #F59E0B ${(currentTime / (mediaDuration || 1)) * 100}%, #27272A ${(currentTime / (mediaDuration || 1)) * 100}%, #27272A 100%)`
                  }}
                />

                <span className="text-[10px] font-mono text-slate-400">{formatSecs(mediaDuration)}</span>
              </div>

              {/* Trigger Buttons and utility capsule */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                
                {/* Controllers layout */}
                <div className="flex items-center gap-3.5">
                  <button
                    onClick={handleTogglePlay}
                    className="w-8 h-8 rounded-full bg-white hover:bg-zinc-100 text-[#1A1A1A] flex items-center justify-center transition shadow-md active:scale-90 cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-black text-black stroke-[3]" /> : <Play className="w-4 h-4 fill-black text-black stroke-[3] ml-0.5" />}
                  </button>

                  {/* Playback speed toggle */}
                  <div className="flex items-center gap-1.5 bg-[#252523] px-2.5 py-1 rounded-lg border border-[#3A3A37]">
                    <span className="text-[9px] uppercase font-mono text-[#71716A] tracking-wider">SPEED</span>
                    <select
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                      className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
                    >
                      <option value={0.5} className="bg-black text-white">0.5x</option>
                      <option value={1} className="bg-black text-white">1.0x</option>
                      <option value={1.5} className="bg-black text-white">1.5x</option>
                      <option value={2} className="bg-black text-white">2.0x</option>
                    </select>
                  </div>
                </div>

                {/* Speaker highlight information */}
                <div className="flex items-center gap-3">
                  
                  {/* Speaker timeline trigger auto-scroll option */}
                  <button
                    onClick={() => setAutoScroll(!autoScroll)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition duration-200 cursor-pointer uppercase font-mono ${
                      autoScroll 
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' 
                        : 'bg-zinc-800/40 text-slate-450 border-[#2A2A28]'
                    }`}
                  >
                    <Activity className={`w-3.5 h-3.5 ${autoScroll ? 'animate-pulse' : ''}`} />
                    <span>Auto-Scroll Dialogue</span>
                  </button>

                  {activeSpeakerName && (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg pointer-events-none animate-bounce-subtle">
                      <Speaker className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-amber-500 font-mono uppercase">SPEAKING: {activeSpeakerName}</span>
                    </div>
                  )}
                </div>

              </div>
              
            </div>

          </div>
        )}

      </div>

      {/* 3. PANE TAB CONTENTS (Scrollable Pane) */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#F8F7F4]/40" ref={scrollContainerRef}>

        {/* 1. STRUCTURAL SUMMARY REPORT TAB */}
        {activeTab === 'report' && (
          <div className="space-y-6 max-w-4xl">
            {meeting.report ? (
              <>
                {/* AI Executive summary */}
                <div className="bg-white border border-[#E5E5E1] p-6 rounded-2xl relative overflow-hidden shadow-sm">
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase text-[#71716A] tracking-widest mb-4">
                    <Sparkles className="w-4 h-4 text-[#1A1A1A]" />
                    AI Executive Summary
                  </h3>
                  <div className="prose max-w-none text-sm text-[#1A1A1A]">
                    {renderMarkdown(meeting.report.summary)}
                  </div>
                </div>

                {/* Grid for Decisions and Risks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Decisions */}
                  <div className="bg-white border border-[#E5E5E1] p-6 rounded-2xl shadow-sm">
                    <h3 className="text-xs font-bold uppercase text-[#71716A] tracking-widest mb-4 flex items-center gap-1.5">
                      <span className="w-1.5 h-5 bg-[#1A1A1A] rounded-sm" />
                      Commitments & Decisions
                    </h3>
                    {meeting.report.decisions && meeting.report.decisions.length > 0 ? (
                      <ul className="space-y-3">
                        {meeting.report.decisions.map((decision, index) => (
                          <li key={index} className="flex gap-2.5 items-start text-xs leading-relaxed text-[#1A1A1A]">
                            <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-[#F8F7F4] border border-[#E5E5E1] text-[#1A1A1A] font-semibold font-mono flex items-center justify-center text-[9px]">
                              {index + 1}
                            </span>
                            <span>{decision}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[#71716A] text-xs italic">No critical milestones or definitive decisions logged on this meeting sync.</p>
                    )}
                  </div>

                  {/* Risks panel */}
                  <div className="bg-white border border-[#E5E5E1] p-6 rounded-2xl shadow-sm border-l-4 border-l-rose-500">
                    <h3 className="text-xs font-bold uppercase text-[#71716A] tracking-widest mb-4 flex items-center gap-1.5">
                      Roadblocks & Risks
                    </h3>
                    {meeting.report.risks && meeting.report.risks.length > 0 ? (
                      <ul className="space-y-3">
                        {meeting.report.risks.map((risk, index) => (
                          <li key={index} className="flex gap-2.5 items-start text-xs leading-relaxed text-[#1A1A1A]">
                            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[#71716A] text-xs italic">No immediate technical or resource roadblocks flagged.</p>
                    )}
                  </div>

                </div>

                {/* Template specifications block */}
                {meeting.report.templateSpecific && Object.keys(meeting.report.templateSpecific).length > 0 && (
                  <div className="bg-white border border-[#E5E5E1] p-6 rounded-2xl shadow-sm">
                    <h3 className="text-xs font-bold uppercase text-[#71716A] tracking-widest mb-4">
                      Context-Specific Analyses ({meeting.template})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(meeting.report.templateSpecific).map(([sectionTitle, desc]) => (
                        <div key={sectionTitle} className="border border-[#E5E5E1] bg-[#F8F7F4] p-4.5 rounded-xl">
                          <h4 className="text-sm font-serif font-semibold text-[#1A1A1A] mb-2">{sectionTitle}</h4>
                          <p className="text-xs text-[#71716A] leading-relaxed">
                            {Array.isArray(desc) ? desc.join(', ') : desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next Meeting suggest */}
                {meeting.report.nextMeeting && (
                  <div className="bg-white border border-[#E5E5E1] p-5 rounded-2xl shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#F8F7F4] rounded-xl text-[#1A1A1A]">
                        <Calendar className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#71716A] tracking-wider">Next Suggested Session</span>
                        <p className="text-xs text-[#1A1A1A] font-semibold">{meeting.report.nextMeeting}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-[#71716A] text-sm">Draft analysis report is offline.</p>
              </div>
            )}
          </div>
        )}

        {/* 2. DYNAMICALLY HIGHLIGHTED TRANSCRIPT DIALOGUE TAB */}
        {activeTab === 'transcript' && (
          <div className="space-y-5 max-w-4xl">
            {/* Search/Filter Bar */}
            <div className="bg-[#1A1A1A]/5 border border-[#E5E5E1] p-4 rounded-2xl flex flex-col sm:flex-row gap-3 items-center justify-between gap-4">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-[#71716A] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="inp_transcript_search"
                  type="text"
                  placeholder="Ask and search transcript words..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-[#E5E5E1] rounded-xl py-2 pl-9.5 pr-4 text-xs text-[#1A1A1A] placeholder-[#71716A]/60 focus:outline-none focus:border-[#71716A]"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
                <span className="text-[11px] text-[#71716A] shrink-0 font-medium">Speaker:</span>
                <button
                  id="btn_speaker_all"
                  onClick={() => setSelectedSpeaker('all')}
                  className={`px-3 py-1.5 rounded text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                    selectedSpeaker === 'all' 
                      ? 'bg-[#1A1A1A] text-white' 
                      : 'text-[#71716A] hover:text-[#1A1A1A]'
                  }`}
                >
                  All speakers
                </button>
                {uniqSpeakers.map(spk => (
                  <button
                    key={spk}
                    onClick={() => setSelectedSpeaker(spk)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                      selectedSpeaker === spk 
                        ? 'bg-[#1A1A1A] text-white' 
                        : 'text-[#71716A] hover:text-[#1A1A1A]'
                    }`}
                  >
                    {spk}
                  </button>
                ))}
              </div>
            </div>

            {/* Hint banner for accuracy alignment */}
            <div className="text-[11px] text-amber-700 bg-amber-50/60 border border-amber-100 p-2.5 rounded-xl flex items-center gap-2 shadow-xs select-none">
              <Sparkle className="w-4 h-4 text-amber-600 animate-spin" />
              <span><strong>Interactive Timelines:</strong> Hover and click any caption card below to jump the media playback or simulated presentation head directly to that spoken segment!</span>
            </div>

            {/* Transcript scroll log */}
            <div id="transcript_timeline_window" className="space-y-4 border-l border-[#E5E5E1] pl-5 ml-4.5 mt-2 py-2">
              {filteredDialogue.length > 0 ? (
                filteredDialogue.map((chunk, index) => {
                  const queryIndices = searchTerm ? chunk.text.toLowerCase().indexOf(searchTerm.toLowerCase()) : -1;
                  const isCurrentlyActiveChunk = activeChunk === chunk;
                  
                  return (
                    <div 
                      key={index} 
                      id={`transcript-chunk-${index}`}
                      onClick={() => handleSeek(chunk.start)}
                      className="relative group/dialogue pb-1 cursor-pointer"
                    >
                      {/* Timeline Dot Indicator */}
                      <div className={`absolute -left-[28.5px] top-2.5 w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 ${
                        isCurrentlyActiveChunk 
                          ? 'bg-amber-500 border-amber-500 ring-4 ring-amber-500/25 scale-120 z-10' 
                          : 'bg-white border-[#1A1A1A] group-hover/dialogue:bg-[#1A1A1A]'
                      }`} />
                      
                      <div className={`p-4 rounded-xl border transition-all duration-300 shadow-xs ${
                        isCurrentlyActiveChunk 
                          ? 'bg-amber-50/30 border-amber-500/80 ring-2 ring-amber-500/10' 
                          : 'bg-white border-[#E5E5E1] hover:border-[#1A1A1A]'
                      }`}>
                        <div className="flex items-center justify-between mb-2 select-none">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded flex items-center gap-1 shadow-2xs ${getSpeakerColor(chunk.speaker)}`}>
                              {isCurrentlyActiveChunk && <Activity className="w-2.5 h-2.5 animate-pulse text-amber-300" />}
                              {chunk.speaker}
                            </span>
                            
                            <span className={`font-mono text-[9px] font-semibold px-2 py-0.5 rounded border transition-colors ${
                              isCurrentlyActiveChunk 
                                ? 'bg-amber-400 border-amber-400 text-slate-900 fill-slate-900' 
                                : 'bg-[#F8F7F4] border-[#E5E5E1] text-[#71716A]'
                            }`}>
                              {formatSecs(chunk.start)} - {formatSecs(chunk.end)}
                            </span>
                          </div>

                          {isCurrentlyActiveChunk && (
                            <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                              <span>Now Segment Speaking</span>
                            </span>
                          )}
                        </div>

                        <p className={`text-sm leading-relaxed transition-all ${isCurrentlyActiveChunk ? 'text-[#1A1A1A] font-medium' : 'text-[#2C2C26]'}`}>
                          {searchTerm && queryIndices !== -1 ? (
                            <>
                              {chunk.text.substring(0, queryIndices)}
                              <span className="bg-[#1A1A1A]/12 text-[#1A1A1A] font-semibold px-0.5 py-0.2 select-all rounded font-medium">
                                {chunk.text.substring(queryIndices, queryIndices + searchTerm.length)}
                              </span>
                              {chunk.text.substring(queryIndices + searchTerm.length)}
                            </>
                          ) : (
                            chunk.text
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 bg-white border border-[#E5E5E1] rounded-2xl">
                  <p className="text-[#71716A] text-xs italic">No matching dialogue chunks logged matching Search constraints.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. TASK TRACKING CHECKLISTS TAB */}
        {activeTab === 'actions' && (
          <div className="space-y-6 max-w-4xl">
            <div className="bg-white border border-[#E5E5E1] p-6 rounded-2xl shadow-sm">
              <h3 className="text-xs font-bold uppercase text-[#71716A] tracking-wider mb-4 flex items-center gap-1.5">
                <CheckSquare className="w-5 h-5 text-[#1A1A1A]" />
                <span>Action assignments tracking ({meeting.actionItems.filter(e => e.status === 'completed').length}/{meeting.actionItems.length})</span>
              </h3>
              
              <div className="space-y-3">
                {meeting.actionItems && meeting.actionItems.length > 0 ? (
                  meeting.actionItems.map((action) => {
                    const isCompleted = action.status === 'completed';
                    return (
                      <div 
                        key={action.id}
                        id={`action_row_${action.id}`}
                        onClick={() => onToggleAction(meeting.id, action.id)}
                        className={`pointer border p-4 rounded-xl cursor-pointer flex items-start gap-4 transition-all duration-300 ${
                          isCompleted 
                            ? 'bg-[#F8F7F4]/50 border-[#E5E5E1] opacity-60 text-[#71716A] font-normal' 
                            : 'bg-white border-[#E5E5E1] hover:border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#F8F7F4]/10'
                        }`}
                      >
                        {/* Checkbox trigger circle toggle */}
                        <div className="flex-shrink-0 mt-0.5">
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            isCompleted 
                              ? 'bg-[#1A1A1A] border-[#1A1A1A] text-white' 
                              : 'border-[#71716A]'
                          }`}>
                            {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>

                        {/* Content text */}
                        <div className="flex-1">
                          <p className={`text-sm leading-snug font-medium ${isCompleted ? 'line-through text-stone-400' : 'text-[#1A1A1A]'}`}>
                            {action.task}
                          </p>
                          <div className="flex items-center gap-3.5 mt-2.5 text-xs">
                            <span className="inline-flex items-center gap-1.5 text-[#71716A] bg-[#F8F7F4] px-2 py-0.5 rounded border border-[#E5E5E1]">
                              <User className="w-3.5 h-3.5 text-[#71716A]" />
                              <span className="font-semibold text-[10px] text-[#1A1A1A]">Assignee: {action.owner}</span>
                            </span>
                            <span className="text-[10px] text-[#71716A] font-mono flex items-center gap-1">
                              Deadline: {action.deadline}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[#71716A] text-xs italic">No actionable owner checklists were generated on this session.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 4. CHANNELS BROADCASTS FOLLOW-UPS TAB */}
        {activeTab === 'followup' && (
          <div className="space-y-6 max-w-4xl">
            {meeting.followUp ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Email block */}
                <div className="bg-white border border-[#E5E5E1] p-6 rounded-2xl flex flex-col h-[520px] shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-[#71716A] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded bg-stone-500" />
                      Client Email Draft
                    </span>
                    <button
                      id="btn_copy_email"
                      onClick={() => executeClipboardCopy('email', meeting.followUp?.email || '')}
                      className="p-1.8 bg-white hover:bg-[#F8F7F4] text-[#1A1A1A] hover:text-black rounded-lg border border-[#E5E5E1] transition flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      {copies['email'] ? <Check className="w-3.5 h-3.5 text-[#1A1A1A]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copies['email'] ? 'Copied ✓' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="flex-1 bg-[#F8F7F4] border border-[#E5E5E1] rounded-xl p-4 overflow-y-auto font-mono text-xs text-[#1A1A1A] leading-relaxed max-h-[420px] whitespace-pre-wrap select-all transition-all duration-200">
                    {meeting.followUp.email}
                  </div>
                </div>

                {/* Slack block */}
                <div className="bg-white border border-[#E5E5E1] p-6 rounded-2xl flex flex-col h-[520px] shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-[#71716A] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded bg-stone-500" />
                      Slack / Channels Broadcast
                    </span>
                    <button
                      id="btn_copy_slack"
                      onClick={() => executeClipboardCopy('slack', meeting.followUp?.slack || '')}
                      className="p-1.8 bg-white hover:bg-[#F8F7F4] text-[#1A1A1A] hover:text-black rounded-lg border border-[#E5E5E1] transition flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      {copies['slack'] ? <Check className="w-3.5 h-3.5 text-[#1A1A1A]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copies['slack'] ? 'Copied ✓' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="flex-1 bg-[#F8F7F4] border border-[#E5E5E1] rounded-xl p-4 overflow-y-auto font-mono text-xs text-[#1A1A1A] leading-relaxed max-h-[420px] whitespace-pre-wrap select-all transition-all duration-200">
                    {meeting.followUp.slack}
                  </div>
                </div>

                {/* Recap workspace */}
                <div className="bg-white border border-[#E5E5E1] p-6 rounded-2xl col-span-1 lg:col-span-2 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-[#71716A] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded bg-stone-500" />
                      Executive Bullet Recap
                    </span>
                    <button
                      id="btn_copy_recap"
                      onClick={() => executeClipboardCopy('recap', meeting.followUp?.recap || '')}
                      className="p-1.8 bg-white hover:bg-[#F8F7F4] text-[#1A1A1A] hover:text-black rounded-lg border border-[#E5E5E1] transition flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      {copies['recap'] ? <Check className="w-3.5 h-3.5 text-[#1A1A1A]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copies['recap'] ? 'Copied ✓' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="bg-[#F8F7F4] border border-[#E5E5E1] p-4.5 rounded-xl text-xs text-[#1A1A1A] leading-relaxed">
                    {meeting.followUp.recap}
                  </p>
                </div>

              </div>
            ) : (
              <p className="text-[#71716A] italic text-xs py-10 text-center">Follow ups have not been parsed on this simulation log.</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
