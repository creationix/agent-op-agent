# Git-FS Capture Extension

Chrome extension for screenshot capture without permission prompts.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select this `chrome-extension` folder

## How It Works

The extension connects to the gitfs server via WebSocket and responds to capture commands using `chrome.tabs.captureVisibleTab()`. This API doesn't require per-page permission prompts.

## Usage

Once installed, `gitfs_capture` will automatically use the extension when available:

```
gitfs_capture()  # No prompts! Captures active tab instantly
```

The extension:
- Connects to `ws://localhost:PORT/ws/ext` automatically
- Reconnects if the server restarts
- Works across page reloads and navigation

## Configuration

By default, connects to port 3456. The port is determined by the gitfs server.

If using a different port, the extension will try to reconnect periodically. Future versions may add a popup to configure the server URL.

## Permissions

- `tabs` - Required for `captureVisibleTab()`
- `activeTab` - Access to the current tab
- `host_permissions: localhost` - Connect to local gitfs server

## Comparison

| Method | Prompts | Survives Reload |
|--------|---------|-----------------|
| Extension | Never | Yes |
| Screen Capture API | Every reload | No |
| Headless (gitfs_screenshot) | Never | N/A (fresh load) |
