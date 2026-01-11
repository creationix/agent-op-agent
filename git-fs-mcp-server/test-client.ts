#!/usr/bin/env bun
/**
 * Test client for git-fs-mcp-server
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const serverPath = join(__dirname, "server.ts")

async function main() {
  console.log("Starting git-fs-mcp-server test client...\n")

  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", serverPath]
  })

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  )

  await client.connect(transport)
  console.log("Connected to server\n")

  // Helper to call tools
  async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
    const result = await client.callTool({ name, arguments: args })
    const text = (result.content as Array<{ type: string; text: string }>)[0].text
    return text
  }

  try {
    // Test 1: List tools
    console.log("=== Test 1: List tools ===")
    const tools = await client.listTools()
    console.log(`Found ${tools.tools.length} tools:`)
    tools.tools.forEach(t => console.log(`  - ${t.name}`))
    console.log()

    // Test 2: List refs (should have default HEAD)
    console.log("=== Test 2: List refs ===")
    const refs = await call("gitfs_list_refs")
    console.log(`Refs: ${refs}`)
    console.log()

    // Test 3: Get default HEAD ref
    console.log("=== Test 3: Get default HEAD ref ===")
    const headHash = await call("gitfs_get_ref", { ref: "refs/work/HEAD" })
    console.log(`refs/work/HEAD -> ${headHash}`)
    console.log()

    // Test 4: Open empty root
    console.log("=== Test 4: Open empty root ===")
    const emptyRoot = await call("gitfs_open_at", { root: "refs/work/HEAD", path: "/" })
    console.log(`Root: ${emptyRoot}`)
    console.log()

    // Test 5: Write text content
    console.log("=== Test 5: Write text content ===")
    const textHash = await call("gitfs_write_text", { content: "Hello, World!\nLine 2" })
    console.log(`Text hash: ${textHash}`)
    console.log()

    // Test 6: Write file at path
    console.log("=== Test 6: Write file at path ===")
    const newRoot1 = await call("gitfs_write_at", {
      root: "refs/work/HEAD",
      path: "src/hello.txt",
      content: "Hello from src!"
    })
    console.log(`New root after write: ${newRoot1}`)
    console.log()

    // Test 7: Verify HEAD was auto-updated
    console.log("=== Test 7: Verify HEAD auto-update ===")
    const updatedHead = await call("gitfs_get_ref", { ref: "refs/work/HEAD" })
    console.log(`HEAD now: ${updatedHead}`)
    console.log(`Matches new root: ${updatedHead === newRoot1}`)
    console.log()

    // Test 8: Read back the file
    console.log("=== Test 8: Read file content ===")
    const fileContent = await call("gitfs_read_at", {
      root: "refs/work/HEAD",
      path: "src/hello.txt"
    })
    console.log(`Content: ${fileContent}`)
    console.log()

    // Test 9: Open intermediate directory
    console.log("=== Test 9: Open intermediate directory ===")
    const srcDir = await call("gitfs_open_at", { root: "refs/work/HEAD", path: "src" })
    console.log(`src dir: ${srcDir}`)
    console.log()

    // Test 10: Add another file
    console.log("=== Test 10: Add another file ===")
    const newRoot2 = await call("gitfs_write_at", {
      root: "refs/work/HEAD",
      path: "src/world.txt",
      content: "World!"
    })
    console.log(`New root: ${newRoot2}`)
    console.log()

    // Test 11: List src directory
    console.log("=== Test 11: List src directory ===")
    const srcDirOpen = await call("gitfs_open_at", { root: "refs/work/HEAD", path: "src" })
    const parsed = JSON.parse(srcDirOpen)
    const srcEntries = await call("gitfs_read", { hash: parsed.hash })
    console.log(`src entries: ${srcEntries}`)
    console.log()

    // Test 12: Time travel - read old root
    console.log("=== Test 12: Time travel to old root ===")
    const oldSrcDir = await call("gitfs_open_at", { root: newRoot1, path: "src" })
    const oldParsed = JSON.parse(oldSrcDir)
    const oldEntries = await call("gitfs_read", { hash: oldParsed.hash })
    console.log(`Old src entries (before world.txt): ${oldEntries}`)
    console.log()

    // Test 13: Write using hash reference
    console.log("=== Test 13: Write using hash reference ===")
    const newRoot3 = await call("gitfs_write_at", {
      root: "refs/work/HEAD",
      path: "src/hello-copy.txt",
      content: `sha256:${textHash}`
    })
    console.log(`New root: ${newRoot3}`)
    const copiedContent = await call("gitfs_read_at", {
      root: "refs/work/HEAD",
      path: "src/hello-copy.txt"
    })
    console.log(`Copied content: ${copiedContent}`)
    console.log()

    // Test 14: Delete file
    console.log("=== Test 14: Delete file ===")
    const newRoot4 = await call("gitfs_delete_at", {
      root: "refs/work/HEAD",
      path: "src/world.txt"
    })
    console.log(`New root after delete: ${newRoot4}`)
    const afterDelete = await call("gitfs_open_at", {
      root: "refs/work/HEAD",
      path: "src/world.txt"
    })
    console.log(`world.txt after delete: ${afterDelete}`)
    console.log()

    // Test 15: Write binary content
    console.log("=== Test 15: Write binary content ===")
    const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString("base64") // PNG header
    const binaryHash = await call("gitfs_write_bytes", { base64: binaryData })
    console.log(`Binary hash: ${binaryHash}`)
    const readBack = await call("gitfs_read", { hash: binaryHash })
    console.log(`Read back: ${readBack}`)
    console.log()

    // Test 16: Write symlink
    console.log("=== Test 16: Write symlink ===")
    const linkHash = await call("gitfs_write_link", { target: "../hello.txt" })
    console.log(`Link hash: ${linkHash}`)
    await call("gitfs_write_at", {
      root: "refs/work/HEAD",
      path: "src/link",
      content: `sha256:${linkHash}`
    })
    const linkOpen = await call("gitfs_open_at", { root: "refs/work/HEAD", path: "src/link" })
    console.log(`Link info: ${linkOpen}`)
    console.log()

    // Test 17: Custom ref
    console.log("=== Test 17: Custom ref ===")
    const currentHead = await call("gitfs_get_ref", { ref: "refs/work/HEAD" })
    await call("gitfs_set_ref", { ref: "refs/tags/v1", hash: currentHead })
    const tagHash = await call("gitfs_get_ref", { ref: "refs/tags/v1" })
    console.log(`refs/tags/v1 -> ${tagHash}`)
    const allRefs = await call("gitfs_list_refs")
    console.log(`All refs: ${allRefs}`)
    console.log()

    // Test 18: Range reads
    console.log("=== Test 18: Range reads ===")
    const multiline = await call("gitfs_write_text", { content: "line1\nline2\nline3\nline4\nline5" })
    const partial = await call("gitfs_read", { hash: multiline, start: 1, end: 3 })
    console.log(`Lines 1-3: ${partial}`)
    console.log()

    console.log("=== All tests passed! ===")

  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error("Test failed:", error)
  process.exit(1)
})
