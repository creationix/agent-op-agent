#!/usr/bin/env bun
// Count tokens for all files in a single format folder
// Usage: bun count-format.ts <format>
//        bun count-format.ts all
// Example: bun count-format.ts jot
// Output saved to <format>/counts.txt

import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"

const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
const SCRIPT_DIR = dirname(import.meta.path)
const ROOT = join(SCRIPT_DIR, "..", "encoding-formats")

async function countTokens(content: string): Promise<number> {
  const response = await fetch(LM_STUDIO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content }],
      max_tokens: 1,
    }),
  })
  const data = (await response.json()) as { usage?: { prompt_tokens: number } }
  return data.usage?.prompt_tokens ?? -1
}

function getDataFiles(formatDir: string): string[] {
  return readdirSync(formatDir).filter((f) => {
    // Skip TypeScript files, markdown, and counts.txt
    if (f.endsWith(".ts") || f.endsWith(".md") || f === "counts.txt") return false
    // Must have an extension
    if (!f.includes(".")) return false
    return true
  })
}

function getFormatDirs(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

async function countFormat(format: string) {
  const formatDir = join(ROOT, format)
  if (!existsSync(formatDir)) {
    console.error(`Format directory not found: ${formatDir}`)
    return
  }

  const files = getDataFiles(formatDir)
  if (files.length === 0) {
    console.error(`No data files found in ${format}/`)
    return
  }

  console.log(`\n========== ${format} ==========`)

  // Group files by extension
  const byExt = new Map<string, string[]>()
  for (const file of files) {
    const ext = file.split(".").slice(1).join(".") // handles .pretty.jot
    const group = byExt.get(ext) || []
    group.push(file)
    byExt.set(ext, group)
  }

  let grandTotal = 0
  let grandBytes = 0
  const output: string[] = []

  function log(line: string) {
    console.log(line)
    output.push(line)
  }

  for (const [ext, extFiles] of byExt) {
    log(`\n=== .${ext} files ===\n`)

    let total = 0
    let bytes = 0
    const results: { file: string; tokens: number; bytes: number }[] = []

    for (const file of extFiles.sort()) {
      const filePath = join(formatDir, file)
      const content = readFileSync(filePath, "utf-8")
      const fileBytes = new TextEncoder().encode(content).length
      const tokens = await countTokens(content)

      results.push({ file, tokens, bytes: fileBytes })
      total += tokens
      bytes += fileBytes
    }

    // Find max filename length for alignment
    const maxLen = Math.max(...results.map((r) => r.file.length))

    for (const { file, tokens, bytes: b } of results) {
      log(
        `${file.padEnd(maxLen)}  ${String(tokens).padStart(5)} tokens  ${String(b).padStart(6)} bytes`
      )
    }

    log(`${"".padEnd(maxLen)}  ${"-".repeat(5)}        ${"-".repeat(6)}`)
    log(
      `${"Total".padEnd(maxLen)}  ${String(total).padStart(5)} tokens  ${String(bytes).padStart(6)} bytes`
    )

    grandTotal += total
    grandBytes += bytes
  }

  if (byExt.size > 1) {
    log(`\n=== Grand Total ===`)
    log(`${grandTotal} tokens, ${grandBytes} bytes`)
  }

  // Save to file
  const outPath = join(formatDir, "counts.txt")
  writeFileSync(outPath, output.join("\n") + "\n")
  console.log(`\nSaved to ${format}/counts.txt`)
}

async function main() {
  const format = process.argv[2]

  if (!format) {
    console.error("Usage: bun count-format.ts <format>")
    console.error("       bun count-format.ts all")
    console.error("Available formats:")
    for (const dir of getFormatDirs()) {
      console.error(`  ${dir}`)
    }
    process.exit(1)
  }

  if (format === "all") {
    for (const dir of getFormatDirs()) {
      await countFormat(dir)
    }
  } else {
    await countFormat(format)
  }
}

main()
