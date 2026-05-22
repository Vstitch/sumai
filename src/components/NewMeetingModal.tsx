import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Sparkles, Mic, FileAudio, Upload, AlertCircle, RefreshCw, HelpCircle, Laptop, Play, Square, AudioLines
} from 'lucide-react';
import { Meeting } from '../types';
import { auth } from '../firebase';

interface NewMeetingModalProps {
  onClose: () => void;
  onMeetingCreated: (m: Meeting) => void;
}

export default function NewMeetingModal({ onClose, onMeetingCreated }: NewMeetingModalProps) {
  const [activeMode, setActiveMode] = useState<'simulate' | 'record' | 'upload'>('simulate');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');

  // 1. Simulator states
  const [simTitle, setSimTitle] = useState('');
  const [simPlatform, setSimPlatform] = useState<'zoom' | 'google-meet' | 'teams' | 'slack' | 'discord' | 'recording'>('google-meet');
  const [simTemplate, setSimTemplate] = useState<'scrum' | 'client' | 'interview' | 'sales' | 'investor'>('scrum');
  const [simInstructions, setSimInstructions] = useState('');

  // 2. Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordTemplate, setRecordTemplate] = useState<'scrum' | 'client' | 'interview' | 'sales' | 'investor'>('scrum');
  const [recordTitle, setRecordTitle] = useState('');
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time live transcript state for the browser's webkitSpeechRecognition API
  const [liveTranscript, setLiveTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  // Screen and system/meet audio capture helpers
  const [recordSource, setRecordSource] = useState<'mic' | 'screen'>('mic');
  const activeStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  // 3. Upload states
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTemplate, setUploadTemplate] = useState<'scrum' | 'client' | 'interview' | 'sales' | 'investor'>('scrum');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multilingual & Translation states
  const [spokenLanguage, setSpokenLanguage] = useState<string>('auto');
  const [translateToEnglish, setTranslateToEnglish] = useState<boolean>(true);

  const stopAllTracks = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      activeStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }
  };

  // Clean recording timers and stream tracks on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopAllTracks();
    };
  }, []);

  // Update screen capture video preview once stream loads
  useEffect(() => {
    if (isRecording && recordSource === 'screen' && activeStreamRef.current && videoPreviewRef.current) {
      try {
        videoPreviewRef.current.srcObject = activeStreamRef.current;
      } catch (err) {
        console.warn("Could not bind active stream to video preview element:", err);
      }
    }
  }, [isRecording, recordSource]);

  // Media Capture starts here
  const toggleRecording = async () => {
    if (isRecording) {
      // STOP RECORDING
      if (mediaRecorder) {
        try {
          mediaRecorder.stop();
        } catch (e) {}
      }
      stopAllTracks();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (recognitionErr) {
          console.warn("Recognition stop error:", recognitionErr);
        }
        recognitionRef.current = null;
      }
    } else {
      // START RECORDING
      setErrorText('');
      setRecordedChunks([]);
      setRecordingDuration(0);
      setLiveTranscript('');

      try {
        let stream: MediaStream;

        if (recordSource === 'screen') {
          // PROMPT SCREEN & TAB CAPTURE
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 360 },
              frameRate: { ideal: 15 }
            },
            audio: true // Request tab or system audio
          });

          let micStream: MediaStream | null = null;
          try {
            // Also acquire microphone to merge client voices and speaker voice
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (micErr) {
            console.warn("Microphone access declined, only recording display audio feedback:", micErr);
          }

          let audioContextMixSuccess = false;
          if (micStream && (displayStream.getAudioTracks().length > 0 || micStream.getAudioTracks().length > 0)) {
            try {
              // Merge display audio track and microphone track via AudioContext node
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              const audioCtx = new AudioContextClass();
              audioCtxRef.current = audioCtx;
              const dest = audioCtx.createMediaStreamDestination();

              let displaySourceConnected = false;
              if (displayStream.getAudioTracks().length > 0) {
                try {
                  const displaySource = audioCtx.createMediaStreamSource(displayStream);
                  displaySource.connect(dest);
                  displaySourceConnected = true;
                } catch (errDisplay) {
                  console.warn("Failed to connect display stream audio source:", errDisplay);
                }
              }

              let micSourceConnected = false;
              if (micStream.getAudioTracks().length > 0) {
                try {
                  const micSource = audioCtx.createMediaStreamSource(micStream);
                  micSource.connect(dest);
                  micSourceConnected = true;
                } catch (errMic) {
                  console.warn("Failed to connect mic stream audio source:", errMic);
                }
              }

              if (displaySourceConnected || micSourceConnected) {
                // Route audio alongside user's screen video feed
                const tracks = [
                  ...dest.stream.getAudioTracks(),
                  ...displayStream.getVideoTracks()
                ];
                stream = new MediaStream(tracks);
                activeStreamRef.current = stream;
                audioContextMixSuccess = true;
              }
            } catch (mixErr) {
              console.warn("AudioContext init or mixing failed, fallback to direct streams:", mixErr);
            }
          }

          if (!audioContextMixSuccess) {
            // Fallback: collect available tracks safely
            const tracks: MediaStreamTrack[] = [
              ...displayStream.getVideoTracks()
            ];
            if (displayStream.getAudioTracks().length > 0) {
              tracks.push(displayStream.getAudioTracks()[0]);
            } else if (micStream && micStream.getAudioTracks().length > 0) {
              tracks.push(micStream.getAudioTracks()[0]);
            }
            stream = new MediaStream(tracks);
            activeStreamRef.current = stream;
          }
        } else {
          // USER MICROPHONE ONLY
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          activeStreamRef.current = stream;
        }

        // Find compatible audio/video MIME format safely
        let options: { mimeType?: string } = {};
        if (recordSource === 'screen') {
          const videoMimetypes = [
            'video/webm',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=h264,opus',
            'video/mp4',
            'video/x-matroska'
          ];
          let foundSupported = false;
          if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
            for (const mime of videoMimetypes) {
              if (MediaRecorder.isTypeSupported(mime)) {
                options = { mimeType: mime };
                foundSupported = true;
                break;
              }
            }
          }
          if (!foundSupported) {
            options = {}; // browser fallback
          }
        } else {
          // Microphone only
          const audioMimetypes = [
            'audio/webm',
            'audio/webm;codecs=opus',
            'audio/ogg;codecs=opus',
            'audio/mp4',
            'audio/aac',
            'audio/wav'
          ];
          let foundSupported = false;
          if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
            for (const mime of audioMimetypes) {
              if (MediaRecorder.isTypeSupported(mime)) {
                options = { mimeType: mime };
                foundSupported = true;
                break;
              }
            }
          }
          if (!foundSupported) {
            options = {}; // browser fallback
          }
        }

        const recorder = new MediaRecorder(stream, options);
        
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            setRecordedChunks((prev) => [...prev, event.data]);
          }
        };

        recorder.start(100); // slice chunks dynamically every 100ms
        setMediaRecorder(recorder);
        setIsRecording(true);

        timerRef.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);

        // Start local window SpeechRecognition for browser captions
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recInstance = new SpeechRecognition();
          recInstance.continuous = true;
          recInstance.interimResults = true;
          
          const langMap: Record<string, string> = {
            'auto': 'en-US',
            'es': 'es-ES',
            'fr': 'fr-FR',
            'de': 'de-DE',
            'zh': 'zh-CN',
            'ja': 'ja-JP',
            'ko': 'ko-KR',
            'hi': 'hi-IN',
            'ta': 'ta-IN',
            'it': 'it-IT',
            'pt': 'pt-BR',
            'ar': 'ar-SA'
          };
          recInstance.lang = langMap[spokenLanguage] || 'en-US';
          
          recInstance.onresult = (event: any) => {
            let currentFullText = '';
            for (let i = 0; i < event.results.length; i++) {
              currentFullText += event.results[i][0].transcript + ' ';
            }
            setLiveTranscript(currentFullText.trim());
          };
          recInstance.onerror = (recErr: any) => {
            console.warn("SpeechRecognition warning:", recErr);
          };
          recInstance.start();
          recognitionRef.current = recInstance;
        }

      } catch (err: any) {
        console.error("Multimedia stream acquire blocked:", err);
        const isIframe = window.self !== window.top;
        if (err.name === "SecurityError" || err.message?.includes("permissions policy") || err.message?.includes("disallowed")) {
          setErrorText(
            isIframe
              ? "Screen & Tab Share is blocked by iframe security policies. Please click the 'Open in New Tab' button in the toolbar above to record screens and tabs perfectly!"
              : `Security policy block: ${err.message}`
          );
        } else if (err.name === "NotAllowedError") {
          setErrorText("Permission to share screen / access mic was denied. Please accept browser permissions settings.");
        } else {
          setErrorText(
            isIframe
              ? "Screen selection is restricted inside the editor frame. Just click the 'Open in New Tab' button in the toolbar above to bypass iframe constraints."
              : "Screen audio feed was rejected or is unsupported. Make sure 'Share tab audio' is ticked when prompted."
          );
        }
      }
    }
  };

  // Convert blob chunk list to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultStr = reader.result as string;
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
  };

  // Submit Simulator to Server
  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simTitle.trim()) {
      setErrorText("A title is required to spark simulation analyses.");
      return;
    }

    setErrorText('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/meetings/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: simTitle.trim(),
          platform: simPlatform,
          template: simTemplate,
          instructions: simInstructions.trim(),
          userId: auth.currentUser?.uid || "anonymous"
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || "Simulation generator failed.");
      }

      onMeetingCreated(resData);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Unable to process simulator. Check connectivity.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Upload Recorded Audio Blob to server for translation
  const handleRecordingSubmit = async () => {
    if (recordedChunks.length === 0 && !liveTranscript.trim()) {
      setErrorText("Please capture some audio or speech content before submitting transcripts.");
      return;
    }

    setErrorText('');
    setIsSubmitting(true);

    try {
      let base64Audio = '';
      if (recordedChunks.length > 0) {
        // Stitch together all audio blob partitions
        const audioBlob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
        base64Audio = await blobToBase64(audioBlob);
      }

      const response = await fetch('/api/meetings/upload-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: recordTitle.trim() || `Recorded Memo — ${new Date().toLocaleTimeString()}`,
          platform: "recording",
          template: recordTemplate,
          base64Audio: base64Audio || undefined,
          fileType: mediaRecorder?.mimeType || 'audio/webm',
          fallbackTranscript: liveTranscript.trim() || undefined,
          userId: auth.currentUser?.uid || "anonymous",
          spokenLanguage,
          translateToEnglish
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || "Acoustic speech parsing failure.");
      }

      onMeetingCreated(resData);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Speech transcription service failed. Try typing inside Simulator instead.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // File drop/upload handlers
  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleFileUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile) {
      setErrorText("Select or drop a recording file first.");
      return;
    }

    setErrorText('');
    setIsSubmitting(true);

    try {
      const base64Audio = await blobToBase64(uploadedFile);

      const response = await fetch('/api/meetings/upload-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: uploadTitle.trim() || uploadedFile.name.replace(/\.[^/.]+$/, ""),
          platform: "recording",
          template: uploadTemplate,
          base64Audio: base64Audio,
          fileType: uploadedFile.type || "audio/webm",
          userId: auth.currentUser?.uid || "anonymous",
          spokenLanguage,
          translateToEnglish
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || "File parsing failed.");
      }

      onMeetingCreated(resData);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Failed transcribing this recording. Try a shorter file or different frequency formats.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return `${mm < 10 ? '0' : ''}${mm}:${ss < 10 ? '0' : ''}${ss}`;
  };

  return (
    <div className="fixed inset-0 bg-stone-900/30 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      
      {/* Modal Card */}
      <div className="bg-white border border-[#E5E5E1] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative animate-scale-up">
        
        {/* Header bar */}
        <div className="p-6 border-b border-[#E5E5E1] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-serif font-bold text-[#1A1A1A] flex items-center gap-1.8">
              <Sparkles className="w-4.5 h-4.5 text-[#1A1A1A]" />
              Ingest Meeting Intelligence
            </h3>
            <p className="text-[#71716A] text-xs mt-0.5">Automated transcribing and report framing</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-[#71716A] hover:text-[#1A1A1A] hover:bg-[#F8F7F4] rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Mode selectors */}
        <div className="flex border-b border-[#E5E5E1] bg-[#F8F7F4] p-1.5 gap-1 shrink-0">
          <button
            onClick={() => { setActiveMode('simulate'); setErrorText(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.2 rounded-lg text-xs font-semibold select-none transition-all ${
              activeMode === 'simulate' 
                ? 'bg-white text-[#1A1A1A] shadow-sm border border-[#E5E5E1]' 
                : 'text-[#71716A] hover:text-[#1A1A1A] hover:bg-white/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Simulator</span>
          </button>
          <button
            onClick={() => { setActiveMode('record'); setErrorText(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.2 rounded-lg text-xs font-semibold select-none transition-all ${
              activeMode === 'record' 
                ? 'bg-white text-[#1A1A1A] shadow-sm border border-[#E5E5E1]' 
                : 'text-[#71716A] hover:text-[#1A1A1A] hover:bg-white/50'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Live Mic</span>
          </button>
          <button
            onClick={() => { setActiveMode('upload'); setErrorText(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.2 rounded-lg text-xs font-semibold select-none transition-all ${
              activeMode === 'upload' 
                ? 'bg-white text-[#1A1A1A] shadow-sm border border-[#E5E5E1]' 
                : 'text-[#71716A] hover:text-[#1A1A1A] hover:bg-white/50'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>
        </div>

        {/* Main interactive area */}
        <div className="p-6 max-h-[480px] overflow-y-auto">

          {/* Diagnostic Error panel */}
          {errorText && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{errorText}</p>
            </div>
          )}

          {/* MODE 1: SIMULATION GENERATOR */}
          {activeMode === 'simulate' && (
            <form onSubmit={handleSimulateSubmit} className="space-y-4">
              <div>
                <label className="block text-[#71716A] text-[10px] font-bold uppercase tracking-wider mb-1.5">Meeting Title *</label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  placeholder="e.g., Q3 Sales Pipeline and Deal Scoping"
                  value={simTitle}
                  onChange={(e) => setSimTitle(e.target.value)}
                  className="w-full bg-white border border-[#E5E5E1] rounded-xl px-3.5 py-2.5 text-xs text-[#1A1A1A] placeholder-[#71716A]/50 focus:outline-none focus:border-[#71716A] focus:ring-1 focus:ring-[#71716A] disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#71716A] text-[10px] font-bold uppercase tracking-wider mb-1.5">Platform Channel</label>
                  <select
                    disabled={isSubmitting}
                    value={simPlatform}
                    onChange={(e) => setSimPlatform(e.target.value as any)}
                    className="w-full bg-white border border-[#E5E5E1] rounded-xl px-3.5 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#71716A]"
                  >
                    <option value="google-meet">Google Meet</option>
                    <option value="zoom">Zoom</option>
                    <option value="teams">MS Teams</option>
                    <option value="slack">Slack Huddles</option>
                    <option value="discord">Discord</option>
                    <option value="recording">Offline recording</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#71716A] text-[10px] font-bold uppercase tracking-wider mb-1.5">Report Template</label>
                  <select
                    disabled={isSubmitting}
                    value={simTemplate}
                    onChange={(e) => setSimTemplate(e.target.value as any)}
                    className="w-full bg-white border border-[#E5E5E1] rounded-xl px-3.5 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#71716A]"
                  >
                    <option value="scrum">Scrum Standup</option>
                    <option value="client">Client Onboarding</option>
                    <option value="interview">Recruit Interview</option>
                    <option value="sales">Sales Call</option>
                    <option value="investor">Investor Pitch</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#71716A] text-[10px] font-bold uppercase tracking-wider mb-1.5">Custom Content Prompts & Topics (Optional)</label>
                <textarea
                  disabled={isSubmitting}
                  rows={4}
                  placeholder="e.g., Sarah Chen reports checkout latencies. John confirms investor meetings on Saturday. Reschedule launching dates."
                  value={simInstructions}
                  onChange={(e) => setSimInstructions(e.target.value)}
                  className="w-full bg-white border border-[#E5E5E1] rounded-xl px-3.5 py-2.5 text-xs text-[#1A1A1A] placeholder-[#71716A]/50 focus:outline-none focus:border-[#71716A] focus:ring-1 focus:ring-[#71716A] resize-none disabled:opacity-50"
                />
              </div>

              <button
                id="btn_submit_simulation"
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-4 flex items-center justify-center gap-1.5 bg-[#1A1A1A] text-white hover:bg-black p-3 rounded-full text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Gemini is generating meeting structure...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-white fill-white" />
                    <span>Run Meeting Simulation</span>
                  </>
                )}
              </button>
            </form>
          )}          {/* MODE 2: MIC & SCREEN CAPTURE RECORDING */}
          {activeMode === 'record' && (
            <div className="space-y-4">
              
              {/* Record Source Selection Toggles */}
              {!isRecording && recordedChunks.length === 0 && (
                <div className="bg-[#F8F7F4] p-1.5 rounded-xl border border-[#E5E5E1] flex gap-1">
                  <button
                    type="button"
                    onClick={() => setRecordSource('mic')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
                      recordSource === 'mic'
                        ? 'bg-white text-[#1A1A1A] border border-[#E5E5E1] shadow-sm'
                        : 'text-[#71716A] hover:bg-white/40 shadow-none border-transparent'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5 text-[#1A1A1A]" />
                    <span>Microphone Only</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordSource('screen')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
                      recordSource === 'screen'
                        ? 'bg-white text-[#1A1A1A] border border-[#E5E5E1] shadow-sm'
                        : 'text-[#71716A] hover:bg-white/40 shadow-none border-transparent'
                    }`}
                  >
                    <Laptop className="w-3.5 h-3.5 text-[#1A1A1A]" />
                    <span>Screen & Meet Tab</span>
                  </button>
                </div>
              )}

              {/* Contextual Guidance Tips */}
              {recordSource === 'mic' ? (
                <div id="tip_meeting_realtime" className="bg-[#F8F7F4] p-3.5 rounded-xl border border-[#E5E5E1] text-[#71716A] text-xs leading-normal">
                  <span className="font-bold text-[#1A1A1A] block mb-0.5">💡 Device Mic Mode</span>
                  Perfect for speaking solo thoughts and face-to-face dialogues. Place your device microphone between speakers.
                </div>
              ) : !isRecording && recordedChunks.length === 0 ? (
                <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-100 text-amber-900 text-xs leading-normal space-y-1">
                  <span className="font-bold block text-amber-950">⚠️ Perfect Google Meet Recording:</span>
                  <p>When the screen sharing pop-up starts, choose your <strong className="font-bold underline">Google Meet Tab</strong> or <strong className="font-bold underline">Zoom Window</strong>. Be absolutely sure to check the <strong className="font-bold">"Share tab audio"</strong> option at the bottom so Google Meet voices are captured!</p>
                </div>
              ) : null}

              {/* Active Multi-modal Visualizer / Video Preview Box */}
              <div className="bg-[#F8F7F4] border border-[#E5E5E1] rounded-xl p-5 flex flex-col items-center justify-center relative overflow-hidden min-h-[160px]">
                
                {isRecording ? (
                  <div className="flex flex-col items-center w-full z-10">
                    
                    {/* Live Stream Screen/Tab Video Preview wrapper */}
                    {recordSource === 'screen' && (
                      <div className="w-full h-[155px] bg-black rounded-lg overflow-hidden mb-3.5 relative border border-[#E5E5E1] shadow-md">
                        <video 
                          ref={videoPreviewRef} 
                          autoPlay 
                          playsInline 
                          muted 
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2 bg-[#1A1A1A]/80 text-white px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest flex items-center gap-1 shadow-sm">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                          Screen Capture Mirror
                        </div>
                      </div>
                    )}

                    <div className="absolute w-32 h-32 bg-red-500/10 rounded-full animate-ping pointer-events-none" />
                    <AudioLines className="w-12 h-12 text-[#1A1A1A] mb-3 animate-pulse" />
                    <span className="font-mono text-xl font-bold tracking-tight text-[#1A1A1A] mb-1.5">
                      {formatTimer(recordingDuration)}
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#71716A] mb-3">
                      {recordSource === 'screen' ? "Recording Tab screen & mixed audio..." : "Recording microphone stream live"}
                    </span>
                    
                    {/* Live Captions Display */}
                    <div className="w-full bg-white border border-[#E5E5E1] rounded-xl p-3 text-left max-h-[100px] overflow-y-auto shadow-sm">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-[#71716A] block mb-0.5">Real-time Caption Flow:</span>
                      <p className="text-[#1A1A1A] text-xs italic leading-relaxed">
                        {liveTranscript || "Listening to speech... Discuss naturally!"}
                      </p>
                    </div>
                  </div>
                ) : recordedChunks.length > 0 ? (
                  <div className="flex flex-col items-center w-full">
                    <FileAudio className="w-12 h-12 text-[#1A1A1A] mb-3" />
                    <span className="text-[#1A1A1A] text-xs font-bold mb-1">
                      Meeting Capture Finalized Successfully!
                    </span>
                    <span className="text-[#71716A] text-[10px] font-mono mb-3">
                      {recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0).toLocaleString()} bytes written to local buffer
                    </span>

                    {/* Editable Live transcript backup */}
                    {liveTranscript && (
                      <div className="w-full bg-white border border-[#E5E5E1] rounded-xl p-3 text-left max-h-[120px] overflow-y-auto shadow-sm">
                        <span className="text-[9px] uppercase tracking-wider font-bold text-[#71716A] block mb-1">Captured Text (Review & Edit):</span>
                        <textarea
                          value={liveTranscript}
                          onChange={(e) => setLiveTranscript(e.target.value)}
                          className="w-full text-xs text-[#1A1A1A] bg-transparent border-none p-0 focus:outline-none focus:ring-0 resize-none h-[65px] leading-relaxed"
                          placeholder="Feel free to supplement or edit captions before submitting..."
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-4">
                    <Mic className="w-10 h-10 text-[#71716A] mb-2" />
                    {recordSource === 'screen' ? (
                      <span className="text-[#71716A] text-xs text-center font-medium px-4 leading-normal">
                        Ready to capture Google Meet. Press start below, choose your Google Meet tab/screen, and confirm "Share Audio" is active.
                      </span>
                    ) : (
                      <span className="text-[#71716A] text-xs text-center font-medium px-4 leading-normal">
                        Prepare your mic. Press start below to record a local audio summary or face-to-face conversation.
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Configure template output for voice memo */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-[#71716A] text-[10px] font-bold uppercase tracking-wider mb-1">Memo / Meeting Title</label>
                  <input
                    type="text"
                    disabled={isRecording || isSubmitting}
                    placeholder="e.g., Q3 Sales Sync or Standup"
                    value={recordTitle}
                    onChange={(e) => setRecordTitle(e.target.value)}
                    className="w-full bg-white border border-[#E5E5E1] rounded-xl px-3.5 py-2.2 text-xs text-[#1A1A1A] placeholder-[#71716A]/50 focus:outline-none disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-[#71716A] text-[10px] font-bold uppercase tracking-wider mb-1">Report Format Template</label>
                  <select
                    disabled={isRecording || isSubmitting}
                    value={recordTemplate}
                    onChange={(e) => setRecordTemplate(e.target.value as any)}
                    className="w-full bg-white border border-[#E5E5E1] rounded-xl px-3.5 py-2.2 text-xs text-[#1A1A1A] focus:outline-none"
                  >
                    <option value="scrum">Scrum Standup Format</option>
                    <option value="client">Client Onboarding Format</option>
                    <option value="interview">Screening interview Format</option>
                    <option value="sales">Sales Presentation Format</option>
                    <option value="investor">Investor Briefing Format</option>
                  </select>
                </div>

                {/* Multilingual / Translation Settings */}
                <div className="bg-[#F8F7F4] p-3.5 rounded-xl border border-[#E5E5E1] space-y-3 pt-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-serif font-bold text-xs text-[#1A1A1A] block">Multilingual intelligence</span>
                      <span className="text-[9px] text-[#71716A]">Translate conversational audio to English</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={translateToEnglish} 
                        onChange={(e) => setTranslateToEnglish(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#1A1A1A]"></div>
                    </label>
                  </div>

                  {translateToEnglish && (
                    <div className="space-y-1">
                      <label className="block text-[#71716A] text-[9px] font-bold uppercase tracking-wider">Spoken Language</label>
                      <select
                        value={spokenLanguage}
                        onChange={(e) => setSpokenLanguage(e.target.value)}
                        className="w-full bg-white border border-[#E5E5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#1A1A1A] focus:outline-none"
                      >
                        <option value="auto">Auto-Detect Spoken Language</option>
                        <option value="es">Spanish (Español)</option>
                        <option value="fr">French (Français)</option>
                        <option value="de">German (Deutsch)</option>
                        <option value="zh">Chinese (中文)</option>
                        <option value="ja">Japanese (日本語)</option>
                        <option value="ko">Korean (한국어)</option>
                        <option value="hi">Hindi (हिन्दी)</option>
                        <option value="ta">Tamil (தமிழ்)</option>
                        <option value="it">Italian (Italiano)</option>
                        <option value="pt">Portuguese (Português)</option>
                        <option value="ar">Arabic (العربية)</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Trigger panel */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  id="btn_mic_action"
                  onClick={toggleRecording}
                  disabled={isSubmitting}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer ${
                    isRecording 
                      ? 'bg-red-600 text-white hover:bg-red-700' 
                      : 'bg-white text-[#1A1A1A] hover:bg-[#F8F7F4] border border-[#E5E5E1]'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square className="w-4 h-4 fill-white text-white border-none" />
                      <span>Stop Active Recording</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-[#1A1A1A] text-[#1A1A1A] border-none" />
                      <span>
                        {recordSource === 'screen' ? "Start Screen Capture" : "Start Voice Capturer"}
                      </span>
                    </>
                  )}
                </button>

                {recordedChunks.length > 0 && !isRecording && (
                  <button
                    id="btn_submit_voice_report"
                    onClick={handleRecordingSubmit}
                    disabled={isSubmitting}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#1A1A1A] text-white hover:bg-black py-3 rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-white hover:text-white" />
                    )}
                    <span>{isSubmitting ? 'Transcribing...' : 'Analyze & Summarize'}</span>
                  </button>
                )}
              </div>

            </div>
          )}

          {/* MODE 3: DIRECT FILE UPLOADER */}
          {activeMode === 'upload' && (
            <form onSubmit={handleFileUploadSubmit} className="space-y-4">
              
              {/* Dropzone container */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#E5E5E1] hover:border-[#71716A] bg-[#F8F7F4] hover:bg-white p-6 rounded-2xl cursor-pointer flex flex-col items-center justify-center relative group transition-colors min-h-[150px]"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={onFileSelect}
                  accept="audio/*,video/*"
                  className="hidden"
                />

                <Upload className="w-10 h-10 text-[#71716A] mb-2 group-hover:text-[#1A1A1A] transition" />
                
                {uploadedFile ? (
                  <div className="text-center px-4">
                    <span className="text-[#1A1A1A] text-xs font-bold block mb-1">
                      {uploadedFile.name}
                    </span>
                    <span className="text-[#71716A] text-[10px] font-mono">
                      {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB • {uploadedFile.type}
                    </span>
                  </div>
                ) : (
                  <div className="text-center px-4">
                    <span className="text-[#1A1A1A] text-xs font-bold block">
                      Drag & Drop meeting file
                    </span>
                    <span className="text-[#71716A] text-[10px] mt-0.5 block">
                      Supports MP3, WAV, M4A, MOV, MP4 up to 40MB
                    </span>
                  </div>
                )}
              </div>

              {uploadedFile && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[#71716A] text-[10px] font-bold uppercase tracking-wider mb-1">Rename Document Title</label>
                    <input
                      type="text"
                      disabled={isSubmitting}
                      placeholder="e.g., Client sync call metadata"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      className="w-full bg-white border border-[#E5E5E1] rounded-xl px-3.5 py-2.2 text-xs text-[#1A1A1A]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#71716A] text-[10px] font-bold uppercase tracking-wider mb-1">Select Analysis Template</label>
                    <select
                      disabled={isSubmitting}
                      value={uploadTemplate}
                      onChange={(e) => setUploadTemplate(e.target.value as any)}
                      className="w-full bg-white border border-[#E5E5E1] rounded-xl px-3.5 py-2.2 text-xs text-[#1A1A1A] focus:outline-none"
                    >
                      <option value="scrum">Scrum Standup Template</option>
                      <option value="client">Client Onboarding Template</option>
                      <option value="interview">Candidate Screening Template</option>
                      <option value="sales">Sales Call Demographics</option>
                      <option value="investor">Investor Financial Board</option>
                    </select>
                  </div>

                  {/* Multilingual / Translation Settings */}
                  <div className="bg-[#F8F7F4] p-3.5 rounded-xl border border-[#E5E5E1] space-y-3 pt-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-serif font-bold text-xs text-[#1A1A1A] block">Multilingual intelligence</span>
                        <span className="text-[9px] text-[#71716A]">Translate conversational audio to English</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={translateToEnglish} 
                          onChange={(e) => setTranslateToEnglish(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#1A1A1A]"></div>
                      </label>
                    </div>

                    {translateToEnglish && (
                      <div className="space-y-1">
                        <label className="block text-[#71716A] text-[9px] font-bold uppercase tracking-wider">Spoken Language</label>
                        <select
                          value={spokenLanguage}
                          onChange={(e) => setSpokenLanguage(e.target.value)}
                          className="w-full bg-white border border-[#E5E5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#1A1A1A] focus:outline-none"
                        >
                          <option value="auto">Auto-Detect Spoken Language</option>
                          <option value="es">Spanish (Español)</option>
                          <option value="fr">French (Français)</option>
                          <option value="de">German (Deutsch)</option>
                          <option value="zh">Chinese (中文)</option>
                          <option value="ja">Japanese (日本語)</option>
                          <option value="ko">Korean (한국어)</option>
                          <option value="hi">Hindi (हिन्दी)</option>
                          <option value="ta">Tamil (தமிழ்)</option>
                          <option value="it">Italian (Italiano)</option>
                          <option value="pt">Portuguese (Português)</option>
                          <option value="ar">Arabic (العربية)</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <button
                    id="btn_submit_file_transcription"
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full mt-4 flex items-center justify-center gap-1.5 bg-[#1A1A1A] text-white hover:bg-black p-3 rounded-full text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Uploading and running speech models...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-white" />
                        <span>Transcribe and Frame Document</span>
                      </>
                    )}
                  </button>
                </div>
              )}

            </form>
          )}

        </div>

      </div>
    </div>
  );
}
