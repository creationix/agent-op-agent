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
        open: { type: "string", description: "Path to open in default browser (e.g., 'refs/work/HEAD/')" }
      }
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
        const { port = 3456, open } = args as { port?: number; open?: string }
        const url = gitfs.startServer(port)
        if (open) {
          const fullUrl = `${url}/${open}`.replace(/([^:])\/\//g, "$1/")
          openBrowser(fullUrl)
        }
        return {
          content: [{ type: "text", text: url }]
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
