document.addEventListener('DOMContentLoaded', async () => {
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
    descEl.textContent = `Syncing to local workspace at ${serverUrl}`;
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
            
            canvasCtx.fillStyle = `rgba(13, 148, 136, ${barHeight/128 + 0.15})`;
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
      
      const response = await fetch(`${serverUrl}/api/meetings/upload-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId,
          title: meetingTitle || `Google Meet Companion — ${new Date().toLocaleTimeString()}`,
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
      alert(`Failed synchronizing meeting: ${uploadErr.message}`);
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
});
