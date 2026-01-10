#!/usr/bin/env bun
// Compare token counts between Anthropic and Qwen tokenizers
// Usage: bun compare-tokenizers.ts

import { countTokens } from "@anthropic-ai/tokenizer"
import { readdirSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"

const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
const SCRIPT_DIR = dirname(import.meta.path)
const ROOT = join(SCRIPT_DIR, "..", "encoding-formats")

async function countQwenTokens(content: string): Promise<number> {
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

type Result = {
  file: string
  anthropic: number
  qwen: number
  diff: string
}

async function main() {
  const formats = ["json", "jot", "lax"]

  for (const format of formats) {
    console.log(`\n=== ${format.toUpperCase()} ===\n`)

    const formatDir = join(ROOT, format)
    const files = readdirSync(formatDir).filter(f => {
      if (f.endsWith(".ts") || f.endsWith(".md") || f === "counts.txt") return false
      if (f.includes(".smart.") || f.includes(".pretty.")) return false
      return f.includes(".")
    }).slice(0, 5) // Just test first 5 files

    const results: Result[] = []
    let totalAnthropic = 0
    let totalQwen = 0

    for (const file of files) {
      const content = readFileSync(join(formatDir, file), "utf-8")
      const anthropic = countTokens(content)
      const qwen = await countQwenTokens(content)

      totalAnthropic += anthropic
      totalQwen += qwen

      const diff = ((qwen - anthropic) / anthropic * 100).toFixed(0)
      results.push({ file, anthropic, qwen, diff: `${diff}%` })
    }

    // Print table
    const maxLen = Math.max(...results.map(r => r.file.length))
    console.log(`${"File".padEnd(maxLen)}  Anthropic  Qwen  Diff`)
    console.log(`${"".padEnd(maxLen)}  ---------  ----  ----`)

    for (const r of results) {
      console.log(`${r.file.padEnd(maxLen)}  ${String(r.anthropic).padStart(9)}  ${String(r.qwen).padStart(4)}  ${r.diff.padStart(4)}`)
    }

    const totalDiff = ((totalQwen - totalAnthropic) / totalAnthropic * 100).toFixed(0)
    console.log(`${"".padEnd(maxLen)}  ---------  ----  ----`)
    console.log(`${"Total".padEnd(maxLen)}  ${String(totalAnthropic).padStart(9)}  ${String(totalQwen).padStart(4)}  ${totalDiff}%`)
  }

  // Test the separator hypothesis
  console.log(`\n=== SEPARATOR TEST ===\n`)
  const tests = [
    { name: 'JSON commas', content: `"a","b","c","d","e"` },
    { name: 'Lax spaces', content: `"a" "b" "c" "d" "e"` },
    { name: 'Jot unquoted', content: `a,b,c,d,e` },
  ]

  for (const t of tests) {
    const anthropic = countTokens(t.content)
    const qwen = await countQwenTokens(t.content)
    console.log(`${t.name.padEnd(15)} "${t.content}"`)
    console.log(`                 Anthropic: ${anthropic}, Qwen: ${qwen}\n`)
  }
}

main()
