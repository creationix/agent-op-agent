#!/usr/bin/env bun
/**
 * Git-FS MCP Server
 *
 * Content-addressable filesystem with immutable snapshots for LLM agents.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js"
import { chromium, type Browser } from "playwright"
import { spawn } from "child_process"
import { gitfs } from "./storage.js"

// Open URL in default browser
function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open"
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref()
}

// Shared browser instance
let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true })
  }
  return browser
}

const server = new Server(
  { name: "git-fs-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
)

const TOOLS = [
  // Refs management
  {
    name: "gitfs_get_ref",
    description: "Get the hash that a ref points to. Returns null if ref doesn't exist.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "The ref name (e.g., 'refs/work/HEAD')" }
      },
      required: ["ref"]
    }
  },
  {
    name: "gitfs_set_ref",
    description: "Set a ref to point to a hash. The hash must exist in storage.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "The ref name to set" },
        hash: { type: "string", description: "The hash to point to (must exist)" }
      },
      required: ["ref", "hash"]
    }
  },
  {
    name: "gitfs_list_refs",
    description: "List all refs, optionally filtered by prefix. Returns array of {ref, hash, mtime} sorted by most recently updated.",
    inputSchema: {
      type: "object",
      properties: {
        prefix: { type: "string", description: "Optional prefix to filter refs (e.g., 'refs/work/')" }
      }
    }
  },
  {
    name: "gitfs_delete_ref",
    description: "Delete a ref. Returns true if deleted, false if ref didn't exist.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "The ref name to delete" }
      },
      required: ["ref"]
    }
  },

  // Reading
  {
    name: "gitfs_open_at",
    description: "Open a path and get its type, hash, and metadata. Returns null if path doesn't exist. Meta is: tree=entry count, text=line count, bytes=byte count, symlink=target path.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Root hash or ref name (e.g., 'refs/work/HEAD')" },
        path: { type: "string", description: "Path to open (e.g., 'src/index.ts')" }
      },
      required: ["root", "path"]
    }
  },
  {
    name: "gitfs_read",
    description: "Read content by hash with optional range. Trees return entries [{name,type,hash}], text returns lines array, bytes returns base64, symlinks return target.",
    inputSchema: {
      type: "object",
      properties: {
        hash: { type: "string", description: "The hash to read" },
        start: { type: "number", description: "Start index (0-based, inclusive)" },
        end: { type: "number", description: "End index (exclusive)" }
      },
      required: ["hash"]
    }
  },
  {
    name: "gitfs_read_at",
    description: "Open path and read content in one call. Combines open_at + read.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Root hash or ref name" },
        path: { type: "string", description: "Path to read" },
        start: { type: "number", description: "Start index (0-based, inclusive)" },
        end: { type: "number", description: "End index (exclusive)" }
      },
      required: ["root", "path"]
    }
  },

  // Writing objects
  {
    name: "gitfs_write_text",
    description: "Write text content and return its hash. Content is stored as lines.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Text content to write" }
      },
      required: ["content"]
    }
  },
  {
    name: "gitfs_write_bytes",
    description: "Write binary content (base64 encoded) and return its hash.",
    inputSchema: {
      type: "object",
      properties: {
        base64: { type: "string", description: "Base64-encoded binary content" }
      },
      required: ["base64"]
    }
  },
  {
    name: "gitfs_write_link",
    description: "Write a symlink and return its hash.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Symlink target path" }
      },
      required: ["target"]
    }
  },

  // Writing to paths
  {
    name: "gitfs_write_at",
    description: "Write content at a path, rebuilding the tree structure. Returns new root hash. If root is a refs/work/* ref, it auto-updates. Content can be text or 'sha256:...' to reference an existing hash.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Root hash or ref name" },
        path: { type: "string", description: "Path to write to (e.g., 'src/index.ts')" },
        content: { type: "string", description: "Text content, or 'sha256:...' to reference existing hash" }
      },
      required: ["root", "path", "content"]
    }
  },
  {
    name: "gitfs_delete_at",
    description: "Delete entry at path, rebuilding tree structure. Returns new root hash or null if nothing to delete. Auto-updates refs/work/* refs.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Root hash or ref name" },
        path: { type: "string", description: "Path to delete" }
      },
      required: ["root", "path"]
    }
  },

  // Export
  {
    name: "gitfs_export",
    description: "Export a tree to a zip file on the host filesystem. Returns the full path to the created zip file. Filename is auto-generated from ref name and hash.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Root hash or ref name to export" },
        outputDir: { type: "string", description: "Directory path on host filesystem where zip will be written" }
      },
      required: ["root", "outputDir"]
    }
  },

  // Web server
  {
    name: "gitfs_serve",
    description: "Start a web server to serve files from the git-fs. Access any root at http://localhost:PORT/ROOT/path. Returns the server URL. Use port 0 for auto-assign.",
    inputSchema: {
      type: "object",
      properties: {
        port: { type: "number", description: "Port to listen on (0 for auto-assign, default 3456)" },
        inject: { type: "boolean", description: "Inject eval-client.js into all HTML pages for remote debugging (default false)" }
      }
    }
  },

  // Open in browser
  {
    name: "gitfs_open",
    description: "Open a URL in the user's default browser. Useful for opening gitfs pages for the user to view.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to open (e.g., 'http://localhost:3456/refs/work/HEAD/')" }
      },
      required: ["url"]
    }
  },

  // Screenshot
  {
    name: "gitfs_screenshot",
    description: "Take a screenshot of a URL using headless Chrome. Returns the screenshot as a base64 PNG image. Useful for visual verification of web pages.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to screenshot (e.g., 'http://localhost:3456/refs/work/HEAD/')" },
        width: { type: "number", description: "Viewport width in pixels (default 1280)" },
        height: { type: "number", description: "Viewport height in pixels (default 720)" },
        fullPage: { type: "boolean", description: "Capture full scrollable page (default false)" }
      },
      required: ["url"]
    }
  },

  // Browser eval
  {
    name: "gitfs_eval",
    description: "Execute JavaScript in a connected browser. Requires the browser to have eval-client.js loaded. Returns the result of the evaluated expression. Use for clicking buttons, reading DOM state, debugging, or any browser interaction.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code to evaluate. Supports async/await. Examples: `document.querySelector('#btn').click()`, `document.title`, `await fetch('/api').then(r => r.json())`" },
        timeout: { type: "number", description: "Timeout in milliseconds (default 30000)" }
      },
      required: ["code"]
    }
  },

  // Browser console
  {
    name: "gitfs_console",
    description: "Get console logs and errors from the connected browser. Useful for debugging JavaScript issues.",
    inputSchema: {
      type: "object",
      properties: {
        clear: { type: "boolean", description: "Clear the console buffer after reading (default false)" }
      }
    }
  },

  // DOM snapshot
  {
    name: "gitfs_dom",
    description: "Get a simplified DOM tree from the connected browser. Returns tag names, key attributes (id, class, href, src), and text content. Useful for understanding page structure without writing query code.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector to start from (default: 'body')" },
        depth: { type: "number", description: "Max depth to traverse (default: 6)" }
      }
    }
  },

  // Screen capture from user's browser
  {
    name: "gitfs_capture",
    description: "Capture a screenshot from the user's actual browser using the Screen Capture API. First call prompts user to select their tab. Subsequent calls reuse the stream (no re-prompt). Returns the current visible state including any JS-modified content.",
    inputSchema: {
      type: "object",
      properties: {
        stop: { type: "boolean", description: "Stop the capture stream (user will need to re-grant permission on next capture)" }
      }
    }
  }
]

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case "gitfs_get_ref": {
        const { ref } = args as { ref: string }
        const hash = gitfs.getRef(ref)
        return {
          content: [{ type: "text", text: hash ?? "null" }]
        }
      }

      case "gitfs_set_ref": {
        const { ref, hash } = args as { ref: string; hash: string }
        gitfs.setRef(ref, hash)
        return {
          content: [{ type: "text", text: "OK" }]
        }
      }

      case "gitfs_list_refs": {
        const { prefix } = args as { prefix?: string }
        const refs = gitfs.listRefs(prefix)
        return {
          content: [{ type: "text", text: JSON.stringify(refs) }]
        }
      }

      case "gitfs_delete_ref": {
        const { ref } = args as { ref: string }
        const deleted = gitfs.deleteRef(ref)
        return {
          content: [{ type: "text", text: deleted ? "true" : "false" }]
        }
      }

      case "gitfs_open_at": {
        const { root, path } = args as { root: string; path: string }
        const result = gitfs.openAt(root, path)
        return {
          content: [{ type: "text", text: result ? JSON.stringify(result) : "null" }]
        }
      }

      case "gitfs_read": {
        const { hash, start, end } = args as { hash: string; start?: number; end?: number }
        const result = gitfs.read(hash, start, end)
        return {
          content: [{ type: "text", text: result !== null ? JSON.stringify(result) : "null" }]
        }
      }

      case "gitfs_read_at": {
        const { root, path, start, end } = args as { root: string; path: string; start?: number; end?: number }
        const result = gitfs.readAt(root, path, start, end)
        return {
          content: [{ type: "text", text: result !== null ? JSON.stringify(result) : "null" }]
        }
      }

      case "gitfs_write_text": {
        const { content } = args as { content: string }
        const hash = gitfs.writeText(content)
        return {
          content: [{ type: "text", text: hash }]
        }
      }

      case "gitfs_write_bytes": {
        const { base64 } = args as { base64: string }
        const hash = gitfs.writeBytes(base64)
        return {
          content: [{ type: "text", text: hash }]
        }
      }

      case "gitfs_write_link": {
        const { target } = args as { target: string }
        const hash = gitfs.writeLink(target)
        return {
          content: [{ type: "text", text: hash }]
        }
      }

      case "gitfs_write_at": {
        const { root, path, content } = args as { root: string; path: string; content: string }
        const newRoot = gitfs.writeAt(root, path, content)
        return {
          content: [{ type: "text", text: newRoot }]
        }
      }

      case "gitfs_delete_at": {
        const { root, path } = args as { root: string; path: string }
        const newRoot = gitfs.deleteAt(root, path)
        return {
          content: [{ type: "text", text: newRoot ?? "null" }]
        }
      }

      case "gitfs_export": {
        const { root, outputDir } = args as { root: string; outputDir: string }
        const filePath = await gitfs.exportZip(root, outputDir)
        return {
          content: [{ type: "text", text: filePath }]
        }
      }

      case "gitfs_serve": {
        const { port = 3456, inject = false } = args as { port?: number; inject?: boolean }
        const url = gitfs.startServer(port, inject)
        return {
          content: [{ type: "text", text: url }]
        }
      }

      case "gitfs_open": {
        const { url } = args as { url: string }
        // If browser connected, navigate it; otherwise open new tab
        if (gitfs.getConnectedBrowsers() > 0) {
          await gitfs.evalInBrowser(`window.location = ${JSON.stringify(url)}`)
          return {
            content: [{ type: "text", text: `Navigated to ${url}` }]
          }
        } else {
          openBrowser(url)
          return {
            content: [{ type: "text", text: `Opened ${url}` }]
          }
        }
      }

      case "gitfs_screenshot": {
        const { url, width = 1280, height = 720, fullPage = false } = args as {
          url: string
          width?: number
          height?: number
          fullPage?: boolean
        }
        const b = await getBrowser()
        // Use fresh context with cache disabled
        const context = await b.newContext({
          viewport: { width, height },
          bypassCSP: true,
        })
        const page = await context.newPage()
        try {
          // Disable cache via CDP
          const client = await page.context().newCDPSession(page)
          await client.send("Network.setCacheDisabled", { cacheDisabled: true })

          // Capture response headers from the main document
          let responseHeaders: Record<string, string> = {}
          page.on("response", (response) => {
            if (response.url() === url || response.url() === url.replace(/\/$/, "")) {
              responseHeaders = response.headers()
            }
          })

          await page.goto(url, { waitUntil: "networkidle" })
          const buffer = await page.screenshot({ fullPage, type: "png" })
          const base64 = buffer.toString("base64")

          // Format headers for display
          const headerText = Object.entries(responseHeaders)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")

          return {
            content: [
              { type: "text", text: `Response headers:\n${headerText}` },
              { type: "image", data: base64, mimeType: "image/png" }
            ]
          }
        } finally {
          await context.close()
        }
      }

      case "gitfs_eval": {
        const { code, timeout = 30000 } = args as { code: string; timeout?: number }
        const connectedBrowsers = gitfs.getConnectedBrowsers()
        if (connectedBrowsers === 0) {
          return {
            content: [{
              type: "text",
              text: "No browser connected.\n\nTo use gitfs_eval:\n1. Add <script src=\"/eval-client.js\"></script> to your HTML\n2. Open the page in a browser\n3. The browser will connect via WebSocket automatically"
            }],
            isError: true
          }
        }

        const result = await gitfs.evalInBrowser(code, timeout)
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        }
      }

      case "gitfs_console": {
        const { clear = false } = args as { clear?: boolean }
        const connectedBrowsers = gitfs.getConnectedBrowsers()
        if (connectedBrowsers === 0) {
          return {
            content: [{
              type: "text",
              text: "No browser connected.\n\nTo use gitfs_console:\n1. Add <script src=\"/eval-client.js\"></script> to your HTML\n2. Open the page in a browser"
            }],
            isError: true
          }
        }

        // Get console data via eval
        const code = clear
          ? `const data = {...window.__gitfs_console, errors: [...window.__gitfs_errors]}; window.__gitfs_console.logs = []; window.__gitfs_console.errors = []; window.__gitfs_console.warns = []; window.__gitfs_errors = []; return data`
          : `return {...window.__gitfs_console, errors: [...window.__gitfs_errors]}`

        const result = await gitfs.evalInBrowser(code)
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        }
      }

      case "gitfs_dom": {
        const { selector = "body", depth = 6 } = args as { selector?: string; depth?: number }
        const connectedBrowsers = gitfs.getConnectedBrowsers()
        if (connectedBrowsers === 0) {
          return {
            content: [{
              type: "text",
              text: "No browser connected.\n\nTo use gitfs_dom:\n1. Use gitfs_serve(inject=true) to auto-inject eval-client.js\n2. Open the page in a browser"
            }],
            isError: true
          }
        }

        // DOM serialization code
        const code = `
          function serializeDOM(el, maxDepth, currentDepth = 0) {
            if (!el || currentDepth > maxDepth) return null;

            // Skip script, style, and invisible elements
            const tag = el.tagName?.toLowerCase();
            if (!tag || ['script', 'style', 'noscript', 'svg', 'path'].includes(tag)) return null;

            // Build node representation
            let node = '<' + tag;

            // Key attributes
            if (el.id) node += ' id="' + el.id + '"';
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.trim();
              if (classes) node += ' class="' + classes.split(/\\s+/).slice(0, 3).join(' ') + (el.className.split(/\\s+/).length > 3 ? '...' : '') + '"';
            }
            if (el.href) node += ' href="' + el.href + '"';
            if (el.src) node += ' src="' + el.src + '"';
            if (el.type) node += ' type="' + el.type + '"';
            if (el.name) node += ' name="' + el.name + '"';
            if (el.value && tag === 'input') node += ' value="' + el.value.slice(0, 20) + (el.value.length > 20 ? '...' : '') + '"';

            node += '>';

            // Get direct text content (not from children)
            let text = '';
            for (const child of el.childNodes) {
              if (child.nodeType === 3) { // Text node
                const t = child.textContent.trim();
                if (t) text += t + ' ';
              }
            }
            text = text.trim();
            if (text) {
              text = text.slice(0, 50) + (text.length > 50 ? '...' : '');
            }

            // Get children
            const children = [];
            for (const child of el.children) {
              const serialized = serializeDOM(child, maxDepth, currentDepth + 1);
              if (serialized) children.push(serialized);
            }

            // Format output
            if (children.length === 0 && text) {
              return node + text + '</' + tag + '>';
            } else if (children.length === 0) {
              return node;
            } else {
              return { node, text: text || undefined, children };
            }
          }

          const root = document.querySelector(${JSON.stringify(selector)});
          if (!root) return 'Element not found: ' + ${JSON.stringify(selector)};
          return serializeDOM(root, ${depth});
        `

        const result = await gitfs.evalInBrowser(code)

        // Format tree as indented text for readability
        function formatTree(node: unknown, indent = 0): string {
          const pad = "  ".repeat(indent)
          if (typeof node === "string") {
            return pad + node
          }
          if (node && typeof node === "object" && "node" in node) {
            const obj = node as { node: string; text?: string; children?: unknown[] }
            let out = pad + obj.node
            if (obj.text) out += " " + obj.text
            if (obj.children) {
              out += "\n" + obj.children.map(c => formatTree(c, indent + 1)).join("\n")
            }
            return out
          }
          return pad + String(node)
        }

        return {
          content: [{
            type: "text",
            text: formatTree(result)
          }]
        }
      }

      case "gitfs_capture": {
        const { stop = false } = args as { stop?: boolean }
        const connectedBrowsers = gitfs.getConnectedBrowsers()
        if (connectedBrowsers === 0) {
          return {
            content: [{
              type: "text",
              text: "No browser connected.\n\nTo use gitfs_capture:\n1. Use gitfs_serve(inject=true) to auto-inject eval-client.js\n2. Open the page in a browser"
            }],
            isError: true
          }
        }

        if (stop) {
          // Stop the capture stream
          const code = `
            if (window.__gitfs_capture_stream) {
              window.__gitfs_capture_stream.getTracks().forEach(t => t.stop());
              window.__gitfs_capture_stream = null;
              return 'Capture stream stopped';
            }
            return 'No active capture stream';
          `
          const result = await gitfs.evalInBrowser(code)
          return {
            content: [{ type: "text", text: String(result) }]
          }
        }

        // Capture screenshot using Screen Capture API
        const code = `
          async function capture() {
            // Get or create screen capture stream
            if (!window.__gitfs_capture_stream || !window.__gitfs_capture_stream.active) {
              try {
                window.__gitfs_capture_stream = await navigator.mediaDevices.getDisplayMedia({
                  video: { displaySurface: 'browser' },
                  audio: false,
                  preferCurrentTab: true
                });
              } catch (e) {
                if (e.name === 'NotAllowedError') {
                  return { error: 'Permission denied. User must grant screen capture permission.' };
                }
                return { error: e.message };
              }
            }

            const stream = window.__gitfs_capture_stream;
            const track = stream.getVideoTracks()[0];

            if (!track || track.readyState !== 'live') {
              window.__gitfs_capture_stream = null;
              return { error: 'Capture stream ended. Call gitfs_capture again to re-grant permission.' };
            }

            // Create video element to capture frame
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;

            await new Promise((resolve, reject) => {
              video.onloadedmetadata = resolve;
              video.onerror = reject;
              setTimeout(() => reject(new Error('Video load timeout')), 5000);
            });

            await video.play();

            // Wait a frame for the video to render
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            // Capture to canvas
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            // Cleanup video element
            video.pause();
            video.srcObject = null;

            // Return as base64 PNG (strip data URL prefix)
            const dataUrl = canvas.toDataURL('image/png');
            return {
              width: canvas.width,
              height: canvas.height,
              data: dataUrl.replace(/^data:image\\/png;base64,/, '')
            };
          }
          return capture();
        `

        const result = await gitfs.evalInBrowser(code, 30000) as { error?: string; width?: number; height?: number; data?: string }

        if (result.error) {
          return {
            content: [{ type: "text", text: `Capture failed: ${result.error}` }],
            isError: true
          }
        }

        return {
          content: [
            { type: "text", text: `Captured ${result.width}x${result.height} from user's browser` },
            { type: "image", data: result.data!, mimeType: "image/png" }
          ]
        }
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true
        }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Git-FS MCP Server running on stdio")
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
