/**
 * Git-FS Capture Extension
 *
 * Waits for content script to announce the server port, then connects.
 * Captures screenshots via chrome.tabs.captureVisibleTab() - no prompts needed.
 */

let ws = null;
let currentPort = null;

// Connect to gitfs server (only called when we know the port)
function connect(port) {
  if (!port) return;

  // Already connected to this port
  if (ws && ws.readyState === WebSocket.OPEN && currentPort === port) {
    return;
  }

  // Close existing connection if switching ports
  if (ws) {
    try { ws.close(); } catch (e) { /* ignore */ }
    ws = null;
  }

  currentPort = port;
  const url = `ws://localhost:${port}/ws/ext`;

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[gitfs-ext] Connected to port', port);
      ws.send(JSON.stringify({ type: 'extension', name: 'gitfs-capture' }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'capture') {
          const result = await captureTab();
          ws.send(JSON.stringify({ type: 'capture-result', id: msg.id, ...result }));
        }
      } catch (err) {
        console.error('[gitfs-ext] Message error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[gitfs-ext] Disconnected');
      ws = null;
    };

    ws.onerror = () => {
      ws = null;
    };
  } catch (err) {
    console.error('[gitfs-ext] Connect error:', err);
    ws = null;
  }
}

// Capture the active tab
async function captureTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      return { error: 'No active tab' };
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

    return {
      width: tab.width,
      height: tab.height,
      url: tab.url,
      title: tab.title,
      data: base64
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'gitfs-port' && msg.port) {
    connect(msg.port);
    sendResponse({ ok: true });
  } else if (msg.type === 'status') {
    sendResponse({ connected: ws?.readyState === WebSocket.OPEN, port: currentPort });
  }
  return true;
});
