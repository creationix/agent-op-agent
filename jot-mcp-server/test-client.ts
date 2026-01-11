#!/usr/bin/env bun
/**
 * Test client for the Jot MCP Server
 *
 * Spawns the server as a subprocess and exercises all tools via the MCP protocol.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { spawn } from "child_process"
import { dirname, join } from "path"

const SCRIPT_DIR = dirname(import.meta.path)

async function main() {
  console.log("Starting Jot MCP Server test client...\n")

  // Spawn the server
  const serverPath = join(SCRIPT_DIR, "server.ts")
  const serverProcess = spawn("bun", ["run", serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  })

  // Create transport and client
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", serverPath],
  })

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  )

  try {
    await client.connect(transport)
    console.log("✓ Connected to server\n")

    // List available tools
    console.log("=== Listing Tools ===")
    const { tools } = await client.listTools()
    for (const tool of tools) {
      console.log(`  - ${tool.name}: ${tool.description?.slice(0, 60)}...`)
    }
    console.log()

    // Test jot_encode
    console.log("=== Testing jot_encode ===")
    const encodeResult = await client.callTool({
      name: "jot_encode",
      arguments: {
        json: JSON.stringify({
          users: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" },
          ],
        }),
      },
    })
    console.log("Input: {users: [{id:1,name:'Alice'},{id:2,name:'Bob'}]}")
    console.log("Output:")
    const encodeText = (encodeResult.content as Array<{ type: string; text: string }>)[0]?.text
    console.log(encodeText?.split("\n").map((l) => "  " + l).join("\n"))
    console.log()

    // Test jot_decode
    console.log("=== Testing jot_decode ===")
    const decodeResult = await client.callTool({
      name: "jot_decode",
      arguments: {
        jot: "{a.b.c:1,x:hello}",
        pretty: true,
      },
    })
    console.log('Input: {a.b.c:1,x:hello}')
    console.log("Output:")
    const decodeText = (decodeResult.content as Array<{ type: string; text: string }>)[0]?.text
    console.log(decodeText?.split("\n").map((l) => "  " + l).join("\n"))
    console.log()

    // Test jot_compare
    console.log("=== Testing jot_compare ===")
    const compareResult = await client.callTool({
      name: "jot_compare",
      arguments: {
        json: JSON.stringify([{ x: 1 }, { x: 2 }, { x: 3 }]),
      },
    })
    console.log("Input: [{x:1},{x:2},{x:3}]")
    console.log("Output:")
    const compareText = (compareResult.content as Array<{ type: string; text: string }>)[0]?.text
    console.log(compareText?.split("\n").map((l) => "  " + l).join("\n"))
    console.log()

    // Test error handling
    console.log("=== Testing Error Handling ===")
    const errorResult = await client.callTool({
      name: "jot_encode",
      arguments: {
        json: "not valid json {",
      },
    })
    const errorText = (errorResult.content as Array<{ type: string; text: string }>)[0]?.text
    console.log(`Invalid JSON input: ${errorText}`)
    console.log()

    console.log("✓ All tests completed successfully!")
  } catch (error) {
    console.error("Test failed:", error)
    process.exit(1)
  } finally {
    await client.close()
    serverProcess.kill()
  }
}

main()
