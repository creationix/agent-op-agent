#!/usr/bin/env bun
// Count tokens for files using LM Studio's API
// Usage: bun count-tokens.ts file1 file2 ...
// Or:    bun count-tokens.ts encoding-formats/json/*.json

import { readFileSync } from "node:fs"

const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"

async function countTokens(content: string): Promise<number> {
  const response = await fetch(LM_STUDIO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content }],
      max_tokens: 1,
    }),
  })
  const data = await response.json()
  return data.usage?.prompt_tokens ?? -1
}

async function main() {
  const files = process.argv.slice(2)

  if (files.length === 0) {
    console.error("Usage: bun count-tokens.ts file1 file2 ...")
    process.exit(1)
  }

  const results: { file: string; tokens: number }[] = []

  for (const file of files) {
    try {
      const content = readFileSync(file, "utf-8")
      const tokens = await countTokens(content)
      results.push({ file, tokens })
    } catch (err) {
      results.push({ file, tokens: -1 })
    }
  }

  // Find max filename length for alignment
  const maxLen = Math.max(...results.map(r => r.file.length))

  for (const { file, tokens } of results) {
    console.log(`${file.padEnd(maxLen)}  ${tokens}`)
  }
}

main()
