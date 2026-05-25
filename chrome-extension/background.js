// REZ AI Chrome Extension Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log("REZ AI Meeting Companion installed.");
});

// Configure Side Panel behavior to open when clicking the toolbar extension action icon
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("Error setting panel behavior:", error));
}
