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

      if (stream.getAudioTracks().length === 0) {
        alert("Warning: No audio track shared. Please check the 'Share tab audio' tick box next time.");
      }

      mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        await uploadRecording();
      };

      // Handle stream end (e.g. user clicks Chrome's "Stop sharing" ribbon)
      stream.getVideoTracks()[0].onended = () => {
        if (isRecording) {
          stopRecording();
        }
      };

      mediaRecorder.start(100);
      isRecording = true;
      actionBtn.textContent = "Stop & Sync Minutes";
      statusText.textContent = "Recording Meet Stream Live...";
      descEl.textContent = "Do not close this tab. Keep the meeting screen active.";
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
  }

  async function uploadRecording() {
    statusText.textContent = "Processing and converting audio...";
    statusDot.className = "dot";

    try {
      const audioBlob = new Blob(audioChunks, { type: 'video/webm' });
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
          fileType: "video/webm"
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
