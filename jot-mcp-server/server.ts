#!/usr/bin/env bun
/**
 * Jot MCP Server
 *
 * A Model Context Protocol server providing tools for working with the Jot format.
 * Jot is a token-efficient alternative to JSON designed for LLM communication.
 *
 * Tools provided:
 * - jot_encode: Convert JSON to Jot format
 * - jot_decode: Convert Jot back to JSON
 * - jot_compare: Compare token counts between JSON and Jot
 *
 * Usage:
 *   bun mcp-servers/server.ts
 *
 * The server communicates over stdio using the MCP protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { stringify, parse } from "../encoding-formats/jot/jot.js"

const server = new Server(
  {
    name: "jot-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// Tool definitions
const TOOLS = [
  {
    name: "jot_encode",
    description:
      "Convert JSON data to Jot format. Jot is a token-efficient encoding that uses minimal quoting, key folding, and table compression. Returns both compact and pretty-printed versions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        json: {
          type: "string",
          description: "JSON string to convert to Jot format",
        },
        pretty: {
          type: "boolean",
          description: "If true, return only the pretty-printed version (default: return both)",
        },
      },
      required: ["json"],
    },
  },
  {
    name: "jot_decode",
    description:
      "Parse Jot format back to JSON. Handles all Jot features including unquoted strings, folded keys (a.b.c), and table syntax ({{:schema;data}}).",
    inputSchema: {
      type: "object" as const,
      properties: {
        jot: {
          type: "string",
          description: "Jot-formatted string to parse",
        },
        pretty: {
          type: "boolean",
          description: "If true, pretty-print the JSON output (default: compact)",
        },
      },
      required: ["jot"],
    },
  },
  {
    name: "jot_compare",
    description:
      "Compare character and byte counts between JSON and Jot encodings. Useful for understanding token efficiency gains.",
    inputSchema: {
      type: "object" as const,
      properties: {
        json: {
          type: "string",
          description: "JSON string to compare",
        },
      },
      required: ["json"],
    },
  },
]

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS }
})

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case "jot_encode": {
        const { json, pretty } = args as { json: string; pretty?: boolean }
        const data = JSON.parse(json)

        if (pretty) {
          const jotPretty = stringify(data, { pretty: true })
          return {
            content: [{ type: "text", text: jotPretty }],
          }
        }

        const jotCompact = stringify(data)
        const jotPretty = stringify(data, { pretty: true })

        return {
          content: [
            {
              type: "text",
              text: `Compact:\n${jotCompact}\n\nPretty:\n${jotPretty}`,
            },
          ],
        }
      }

      case "jot_decode": {
        const { jot, pretty } = args as { jot: string; pretty?: boolean }
        const data = parse(jot)
        const jsonStr = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)

        return {
          content: [{ type: "text", text: jsonStr }],
        }
      }

      case "jot_compare": {
        const { json } = args as { json: string }
        const data = JSON.parse(json)

        const jsonCompact = JSON.stringify(data)
        const jsonPretty = JSON.stringify(data, null, 2)
        const jotCompact = stringify(data)
        const jotPretty = stringify(data, { pretty: true })

        const stats = (label: string, str: string) => {
          const bytes = new TextEncoder().encode(str).length
          return `${label}: ${str.length} chars, ${bytes} bytes`
        }

        const savings = (jsonStr: string, jotStr: string) => {
          const pct = ((jsonStr.length - jotStr.length) / jsonStr.length * 100).toFixed(1)
          return `${pct}% smaller`
        }

        const report = [
          "=== Character/Byte Comparison ===",
          "",
          stats("JSON (compact)", jsonCompact),
          stats("Jot (compact) ", jotCompact),
          `  → ${savings(jsonCompact, jotCompact)}`,
          "",
          stats("JSON (pretty) ", jsonPretty),
          stats("Jot (pretty)  ", jotPretty),
          `  → ${savings(jsonPretty, jotPretty)}`,
        ].join("\n")

        return {
          content: [{ type: "text", text: report }],
        }
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    }
  }
})

// Start the server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Jot MCP Server running on stdio")
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
