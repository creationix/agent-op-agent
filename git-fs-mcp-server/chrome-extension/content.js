/**
 * Git-FS Capture - Content Script
 *
 * Runs on localhost pages and tells the background script which port to connect to.
 */

// Get port from current page URL
const port = location.port || (location.protocol === 'https:' ? '443' : '80');

// Tell background script about this port
chrome.runtime.sendMessage({
  type: 'gitfs-port',
  port: parseInt(port, 10),
  url: location.href
});

console.log('[gitfs-ext] Detected gitfs server on port', port);
