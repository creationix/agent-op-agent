#!/usr/bin/env bun
// Update SUMMARY.md Token Efficiency tables from counts.txt files
// Usage: bun update-summary.ts

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"

const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
const SCRIPT_DIR = dirname(import.meta.path)
const ROOT = join(SCRIPT_DIR, "..", "encoding-formats")
const SUMMARY_PATH = join(ROOT, "SUMMARY.md")

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

// Format display names and links
const FORMAT_INFO: Record<string, { link: string; bold?: boolean }> = {
  jot: { link: "[Jot](jot/)", bold: true },
  "jot-pretty": { link: "[Jot](jot/) (pretty)", bold: true },
  "json-mini": { link: "[JSON](https://www.json.org/) (mini)" },
  "json-pretty": { link: "[JSON](https://www.json.org/) (pretty)" },
  "json-smart": { link: "[JSON](json/smart-json.ts) (smart)" },
  jsonito: { link: "[JSONito](https://github.com/creationix/jsonito)" },
  lax: { link: "[Lax](lax/)" },
  toon: { link: "[TOON](toon/)" },
  d2: { link: "[D2](https://github.com/creationix/d2)" },
  yaml: { link: "[YAML](https://yaml.org/)" },
  toml: { link: "[TOML](https://toml.io/)" },
}

// Which category each format belongs to
const COMPACT_FORMATS = ["jot", "jsonito", "lax", "d2", "json-mini"]
const PRETTY_FORMATS = ["jot-pretty", "json-smart", "yaml", "toml", "toon", "json-pretty"]

type FormatStats = { tokens: number; bytes: number }

function parseCountsFile(content: string): Map<string, FormatStats> {
  const results = new Map<string, FormatStats>()
  let currentExt = ""

  for (const line of content.split("\n")) {
    const sectionMatch = line.match(/^=== \.(.+) files ===$/)
    if (sectionMatch) {
      currentExt = sectionMatch[1]
      continue
    }

    const totalMatch = line.match(/^Total\s+(\d+)\s+tokens\s+(\d+)\s+bytes/)
    if (totalMatch && currentExt) {
      results.set(currentExt, {
        tokens: parseInt(totalMatch[1]),
        bytes: parseInt(totalMatch[2]),
      })
    }
  }

  return results
}

function pct(val: number, baseline: number): string {
  if (val === baseline) return "baseline"
  const diff = ((val - baseline) / baseline) * 100
  const sign = diff > 0 ? "+" : ""
  return `${sign}${Math.round(diff)}%`
}

function buildTable(
  rows: { key: string; tokens: number; bytes: number }[],
  baselineKey: string
): string {
  rows.sort((a, b) => a.tokens - b.tokens)

  const baseline = rows.find((r) => r.key === baselineKey)
  if (!baseline) {
    console.error(`Baseline ${baselineKey} not found!`)
    return ""
  }

  let table = ""
  for (const row of rows) {
    const info = FORMAT_INFO[row.key] || { link: row.key }
    const link = info.bold ? `**${info.link}**` : info.link
    const tokenPct = row.key === baselineKey ? "baseline" : pct(row.tokens, baseline.tokens)
    const bytePct = row.key === baselineKey ? "baseline" : pct(row.bytes, baseline.bytes)

    const padLink = link.padEnd(51)
    const padTokens = row.tokens.toLocaleString().padStart(6)
    const padTokenPct = tokenPct.padStart(8)
    const padBytes = row.bytes.toLocaleString().padStart(6)
    const padBytePct = bytePct.padStart(8)

    table += `| ${padLink} | ${padTokens} | ${padTokenPct} | ${padBytes} | ${padBytePct} |\n`
  }

  return table
}

function updateSection(content: string, startMarker: string, endMarker: string, table: string): string {
  if (content.includes(startMarker) && content.includes(endMarker)) {
    const before = content.slice(0, content.indexOf(startMarker) + startMarker.length)
    const afterMarker = content.slice(content.indexOf(endMarker))
    // Keep the table header that's after the start marker
    const headerEnd = before.lastIndexOf("\n")
    const header = `| Format                                              | Tokens | vs JSON  | Bytes  | vs JSON  |
|-----------------------------------------------------|-------:|---------:|-------:|---------:|
`
    return before + "\n" + header + table + afterMarker
  }
  return content
}

async function main() {
  const allStats: Map<string, FormatStats> = new Map()

  // Process each format directory
  for (const dir of readdirSync(ROOT, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue

    const countsPath = join(ROOT, dir.name, "counts.txt")
    if (!existsSync(countsPath)) {
      console.error(`No counts.txt in ${dir.name}/, skipping`)
      continue
    }

    const content = readFileSync(countsPath, "utf-8")
    const stats = parseCountsFile(content)

    if (dir.name === "jot") {
      const jotStats = stats.get("jot")
      const prettyStats = stats.get("pretty.jot")
      if (jotStats) allStats.set("jot", jotStats)
      if (prettyStats) allStats.set("jot-pretty", prettyStats)
    } else if (dir.name === "json") {
      // Get smart JSON stats from counts.txt
      const smartStats = stats.get("smart.json")
      if (smartStats) allStats.set("json-smart", smartStats)

      // Count both minified and standard pretty JSON (need to compute, not in counts.txt)
      const jsonDir = join(ROOT, "json")
      let miniTokens = 0, miniBytes = 0
      let prettyTokens = 0, prettyBytes = 0

      console.log("Counting JSON tokens...")
      for (const file of readdirSync(jsonDir).filter((f) => f.endsWith(".json") && !f.includes("smart"))) {
        const raw = readFileSync(join(jsonDir, file), "utf-8")
        const minified = JSON.stringify(JSON.parse(raw))
        const pretty = JSON.stringify(JSON.parse(raw), null, 2)

        miniBytes += new TextEncoder().encode(minified).length
        miniTokens += await countTokens(minified)

        prettyBytes += new TextEncoder().encode(pretty).length
        prettyTokens += await countTokens(pretty)
      }

      console.log(`  minified: ${miniTokens} tokens, ${miniBytes} bytes`)
      console.log(`  pretty:   ${prettyTokens} tokens, ${prettyBytes} bytes`)
      console.log(`  smart:    ${smartStats?.tokens} tokens, ${smartStats?.bytes} bytes`)

      allStats.set("json-mini", { tokens: miniTokens, bytes: miniBytes })
      allStats.set("json-pretty", { tokens: prettyTokens, bytes: prettyBytes })
    } else {
      const ext = Array.from(stats.keys())[0]
      if (ext) {
        allStats.set(dir.name, stats.get(ext)!)
      }
    }
  }

  // Build compact table
  const compactRows = COMPACT_FORMATS
    .filter((k) => allStats.has(k))
    .map((k) => ({ key: k, ...allStats.get(k)! }))
  const compactTable = buildTable(compactRows, "json-mini")

  // Build pretty table
  const prettyRows = PRETTY_FORMATS
    .filter((k) => allStats.has(k))
    .map((k) => ({ key: k, ...allStats.get(k)! }))
  const prettyTable = buildTable(prettyRows, "json-pretty")

  // Update SUMMARY.md
  let summary = readFileSync(SUMMARY_PATH, "utf-8")
  summary = updateSection(summary, "<!-- COMPACT_START -->", "<!-- COMPACT_END -->", compactTable)
  summary = updateSection(summary, "<!-- PRETTY_START -->", "<!-- PRETTY_END -->", prettyTable)
  writeFileSync(SUMMARY_PATH, summary)

  console.log("Updated SUMMARY.md")
}

main()
