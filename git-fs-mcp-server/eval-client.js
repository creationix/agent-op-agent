/**
 * Git-FS Eval Client
 *
 * Include this script in your HTML to enable remote JavaScript evaluation.
 * The script connects to the gitfs server via WebSocket and executes
 * code sent from the gitfs_eval MCP tool.
 *
 * Usage: <script src="/eval-client.js"></script>
 *
 * The script auto-detects the server URL from the page's location.
 */
(function() {
  'use strict';

  // Determine WebSocket URL from current page location
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws/eval`;

  // Connection state
  let ws = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  const reconnectDelay = 1000;

  // Console capture - store recent logs/errors
  const consoleBuffer = {
    logs: [],
    errors: [],
    warns: [],
    maxEntries: 100
  };

  // Intercept console methods
  const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console)
  };

  function captureConsole(type, args) {
    const buffer = consoleBuffer[type + 's'] || consoleBuffer.logs;
    buffer.push({
      time: Date.now(),
      args: Array.from(args).map(arg => {
        try {
          if (arg instanceof Error) {
            return { type: 'error', message: arg.message, stack: arg.stack };
          }
          return JSON.parse(JSON.stringify(arg));
        } catch {
          return String(arg);
        }
      })
    });
    // Trim to max entries
    while (buffer.length > consoleBuffer.maxEntries) {
      buffer.shift();
    }
  }

  console.log = function(...args) {
    captureConsole('log', args);
    originalConsole.log(...args);
  };

  console.error = function(...args) {
    captureConsole('error', args);
    originalConsole.error(...args);
  };

  console.warn = function(...args) {
    captureConsole('warn', args);
    originalConsole.warn(...args);
  };

  // Capture uncaught errors
  window.__gitfs_errors = [];
  window.addEventListener('error', (event) => {
    window.__gitfs_errors.push({
      time: Date.now(),
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
    // Keep only last 50 errors
    while (window.__gitfs_errors.length > 50) {
      window.__gitfs_errors.shift();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    window.__gitfs_errors.push({
      time: Date.now(),
      message: String(event.reason),
      type: 'unhandledrejection',
      stack: event.reason?.stack
    });
    while (window.__gitfs_errors.length > 50) {
      window.__gitfs_errors.shift();
    }
  });

  // Expose console buffer for gitfs_eval access
  window.__gitfs_console = consoleBuffer;

  // Connect to WebSocket
  function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = function() {
        reconnectAttempts = 0;
        originalConsole.log('[gitfs-eval] Connected to', wsUrl);
      };

      ws.onmessage = async function(event) {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'connected') {
            originalConsole.log('[gitfs-eval] Server acknowledged connection, clients:', data.clients);
            return;
          }

          if (data.type === 'eval' && data.id && data.code) {
            originalConsole.log('[gitfs-eval] Evaluating:', data.code.slice(0, 100) + (data.code.length > 100 ? '...' : ''));

            try {
              // Use AsyncFunction to support await in the code
              const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
              const fn = new AsyncFunction(data.code);
              const result = await fn();

              // Serialize result
              let serializedResult;
              try {
                serializedResult = JSON.parse(JSON.stringify(result));
              } catch {
                serializedResult = String(result);
              }

              ws.send(JSON.stringify({
                type: 'result',
                id: data.id,
                success: true,
                result: serializedResult
              }));
            } catch (error) {
              ws.send(JSON.stringify({
                type: 'result',
                id: data.id,
                success: false,
                error: error.message,
                stack: error.stack
              }));
            }
          }
        } catch (parseError) {
          originalConsole.error('[gitfs-eval] Failed to parse message:', parseError);
        }
      };

      ws.onclose = function() {
        originalConsole.log('[gitfs-eval] Connection closed');
        scheduleReconnect();
      };

      ws.onerror = function(error) {
        originalConsole.error('[gitfs-eval] WebSocket error:', error);
      };

    } catch (error) {
      originalConsole.error('[gitfs-eval] Failed to connect:', error);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
      originalConsole.error('[gitfs-eval] Max reconnect attempts reached, giving up');
      return;
    }

    reconnectAttempts++;
    const delay = reconnectDelay * Math.min(reconnectAttempts, 5);
    originalConsole.log(`[gitfs-eval] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
    setTimeout(connect, delay);
  }

  // Start connection
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }

  // Expose for manual reconnection
  window.__gitfs_reconnect = connect;
})();
