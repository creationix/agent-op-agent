#!/usr/bin/env bun
// Update SUMMARY.md Token Efficiency tables from counts.txt files
// Usage: bun update-summary.ts

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { countTokens as countLegacyTokens } from "@anthropic-ai/tokenizer"

const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
const SCRIPT_DIR = dirname(import.meta.path)
const ROOT = join(SCRIPT_DIR, "..", "encoding-formats")
const SUMMARY_PATH = join(ROOT, "SUMMARY.md")
const TOKEN_COUNTS_PATH = join(ROOT, "TOKEN_COUNTS.md")
const CLAUDE_COUNTS_PATH = join(ROOT, "claude-counts-sonnet.txt")

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

// Map Claude format names to our keys
const CLAUDE_FORMAT_MAP: Record<string, string> = {
  "Jot": "jot",
  "Jot (pretty)": "jot-pretty",
  "JSON (mini)": "json-mini",
  "JSON (pretty)": "json-pretty",
  "JSON (smart)": "json-smart",
  "JSONito": "jsonito",
  "Lax": "lax",
  "TOON": "toon",
  "YAML": "yaml",
  "D2": "d2",
  "TOML": "toml",
}

// Which category each format belongs to
const COMPACT_FORMATS = ["jot", "jsonito", "lax", "d2", "json-mini"]
const PRETTY_FORMATS = ["jot-pretty", "json-smart", "yaml", "toml", "toon", "json-pretty"]

type FormatStats = { tokens: number; bytes: number; claudeTokens?: number; legacyTokens?: number }
type PerFileStats = Map<string, number> // fileName -> tokens

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

// Parse per-file token counts from counts.txt (for the first extension only)
function parsePerFileCountsFile(content: string, targetExt?: string): PerFileStats {
  const results = new Map<string, number>()
  let currentExt = ""
  let foundTarget = false

  for (const line of content.split("\n")) {
    const sectionMatch = line.match(/^=== \.(.+) files ===$/)
    if (sectionMatch) {
      currentExt = sectionMatch[1]
      // If we have a target extension, only parse that section
      if (targetExt) {
        foundTarget = currentExt === targetExt
      } else {
        // Otherwise, only parse the first section
        foundTarget = results.size === 0
      }
      continue
    }

    if (!foundTarget) continue

    // Match lines like: "chat.jot                       67 tokens     235 bytes"
    const fileMatch = line.match(/^(\S+)\.\S+\s+(\d+)\s+tokens/)
    if (fileMatch && currentExt) {
      const fileName = fileMatch[1]
      const tokens = parseInt(fileMatch[2])
      results.set(fileName, tokens)
    }

    // Stop when we hit total line
    if (line.match(/^Total\s+\d+\s+tokens/)) {
      if (!targetExt) break // Only break early if not targeting specific extension
    }
  }

  return results
}

function parseClaudeCounts(): Map<string, number> {
  const results = new Map<string, number>()

  if (!existsSync(CLAUDE_COUNTS_PATH)) {
    console.log("No Claude counts file found, skipping Claude column")
    return results
  }

  const content = readFileSync(CLAUDE_COUNTS_PATH, "utf-8")
  let currentFormat = ""

  for (const line of content.split("\n")) {
    const sectionMatch = line.match(/^=== (.+) ===$/)
    if (sectionMatch) {
      currentFormat = sectionMatch[1]
      continue
    }

    const totalMatch = line.match(/^\s+Total:\s+(\d+)/)
    if (totalMatch && currentFormat) {
      const key = CLAUDE_FORMAT_MAP[currentFormat]
      if (key) {
        results.set(key, parseInt(totalMatch[1]))
      }
    }
  }

  return results
}

// Compute JSON mini per-file counts using legacy tokenizer (for chart baseline)
function computeJsonMiniPerFile(): PerFileStats {
  const results = new Map<string, number>()
  const jsonDir = join(ROOT, "json")
  const sourceFiles = readdirSync(jsonDir).filter((f) => f.endsWith(".json") && !f.includes("smart"))

  for (const file of sourceFiles) {
    const baseName = file.replace(".json", "")
    const content = JSON.stringify(JSON.parse(readFileSync(join(jsonDir, file), "utf-8")))
    results.set(baseName, countLegacyTokens(content))
  }

  return results
}

// Compute legacy tokenizer counts for all formats
function computeLegacyCounts(): Map<string, number> {
  const results = new Map<string, number>()
  const jsonDir = join(ROOT, "json")
  const sourceFiles = readdirSync(jsonDir).filter((f) => f.endsWith(".json") && !f.includes("smart"))

  // Helper to count tokens for all source files
  const countAll = (getContent: (baseName: string) => string): number => {
    let total = 0
    for (const file of sourceFiles) {
      const baseName = file.replace(".json", "")
      try {
        total += countLegacyTokens(getContent(baseName))
      } catch {
        // Skip files that fail
      }
    }
    return total
  }

  // JSON mini
  results.set("json-mini", countAll((f) =>
    JSON.stringify(JSON.parse(readFileSync(join(jsonDir, `${f}.json`), "utf-8")))
  ))

  // JSON pretty
  results.set("json-pretty", countAll((f) =>
    JSON.stringify(JSON.parse(readFileSync(join(jsonDir, `${f}.json`), "utf-8")), null, 2)
  ))

  // JSON smart
  results.set("json-smart", countAll((f) =>
    readFileSync(join(jsonDir, `${f}.smart.json`), "utf-8")
  ))

  // Jot
  results.set("jot", countAll((f) =>
    readFileSync(join(ROOT, "jot", `${f}.jot`), "utf-8")
  ))

  // Jot pretty
  results.set("jot-pretty", countAll((f) =>
    readFileSync(join(ROOT, "jot", `${f}.pretty.jot`), "utf-8")
  ))

  // Lax
  results.set("lax", countAll((f) =>
    readFileSync(join(ROOT, "lax", `${f}.lax`), "utf-8")
  ))

  // JSONito
  results.set("jsonito", countAll((f) =>
    readFileSync(join(ROOT, "jsonito", `${f}.jito`), "utf-8")
  ))

  // TOON
  results.set("toon", countAll((f) =>
    readFileSync(join(ROOT, "toon", `${f}.toon`), "utf-8")
  ))

  // YAML
  results.set("yaml", countAll((f) =>
    readFileSync(join(ROOT, "yaml", `${f}.yaml`), "utf-8")
  ))

  // D2
  results.set("d2", countAll((f) =>
    readFileSync(join(ROOT, "d2", `${f}.d2`), "utf-8")
  ))

  // TOML
  results.set("toml", countAll((f) =>
    readFileSync(join(ROOT, "toml", `${f}.toml`), "utf-8")
  ))

  return results
}

// Format a value with percentage inline, e.g. "6,305 (-19%)"
function valWithPct(val: number, baseline: number, isBaseline: boolean): string {
  const valStr = val.toLocaleString()
  if (isBaseline) return valStr
  const diff = ((val - baseline) / baseline) * 100
  const sign = diff > 0 ? "+" : ""
  return `${valStr} (${sign}${Math.round(diff)}%)`
}

function buildTable(
  rows: { key: string; tokens: number; bytes: number; claudeTokens?: number; legacyTokens?: number }[],
  baselineKey: string,
  claudeCounts: Map<string, number>,
  legacyCounts: Map<string, number>
): string {
  // Add Claude and legacy tokens to rows
  for (const row of rows) {
    row.claudeTokens = claudeCounts.get(row.key)
    row.legacyTokens = legacyCounts.get(row.key)
  }

  rows.sort((a, b) => a.tokens - b.tokens)

  const baseline = rows.find((r) => r.key === baselineKey)
  if (!baseline) {
    console.error(`Baseline ${baselineKey} not found!`)
    return ""
  }

  const claudeBaseline = baseline.claudeTokens
  const legacyBaseline = baseline.legacyTokens

  // Determine if we should show Legacy/Claude columns (if any row has data)
  const hasLegacyData = rows.some((r) => r.legacyTokens !== undefined) && legacyBaseline !== undefined
  const hasClaudeData = rows.some((r) => r.claudeTokens !== undefined) && claudeBaseline !== undefined

  let table = ""
  for (const row of rows) {
    const info = FORMAT_INFO[row.key] || { link: row.key }
    const link = info.bold ? `**${info.link}**` : info.link
    const isBaseline = row.key === baselineKey

    const padLink = link.padEnd(51)
    const qwenCol = valWithPct(row.tokens, baseline.tokens, isBaseline).padStart(14)
    const bytesCol = valWithPct(row.bytes, baseline.bytes, isBaseline).padStart(14)

    // Legacy column (show empty cell if column exists but row has no data)
    let legacyCol = ""
    if (hasLegacyData) {
      if (row.legacyTokens !== undefined) {
        legacyCol = ` | ${valWithPct(row.legacyTokens, legacyBaseline!, isBaseline).padStart(14)}`
      } else {
        legacyCol = ` | ${"".padStart(14)}`
      }
    }

    // Claude column (show empty cell if column exists but row has no data)
    let claudeCol = ""
    if (hasClaudeData) {
      if (row.claudeTokens !== undefined) {
        claudeCol = ` | ${valWithPct(row.claudeTokens, claudeBaseline!, isBaseline).padStart(14)}`
      } else {
        claudeCol = ` | ${"".padStart(14)}`
      }
    }

    // Order: Format | Qwen | Legacy | Claude | Bytes
    table += `| ${padLink} | ${qwenCol}${legacyCol}${claudeCol} | ${bytesCol} |\n`
  }

  return table
}

function updateSection(
  content: string,
  startMarker: string,
  endMarker: string,
  table: string,
  hasLegacy: boolean,
  hasClaude: boolean
): string {
  if (content.includes(startMarker) && content.includes(endMarker)) {
    const before = content.slice(0, content.indexOf(startMarker) + startMarker.length)
    const afterMarker = content.slice(content.indexOf(endMarker))

    const legacyHeader = hasLegacy ? " Legacy         |" : ""
    const legacySep = hasLegacy ? "---------------:|" : ""
    const claudeHeader = hasClaude ? " Claude         |" : ""
    const claudeSep = hasClaude ? "---------------:|" : ""

    const header = `| Format                                              | Qwen           |${legacyHeader}${claudeHeader} Bytes          |
|-----------------------------------------------------|---------------:|${legacySep}${claudeSep}---------------:|
`
    return before + "\n" + header + table + afterMarker
  }
  return content
}

// Chart labels for each format
const CHART_LABELS: Record<string, string> = {
  jot: "Jot",
  "jot-pretty": "Jot-P",
  jsonito: "JSONito",
  lax: "Lax",
  "json-mini": "JSON-m",
  "json-pretty": "JSON-p",
  "json-smart": "JSON-s",
  d2: "D2",
  toon: "TOON",
  yaml: "YAML",
  toml: "TOML",
}

function buildChart(
  allStats: Map<string, FormatStats>,
  claudeCounts: Map<string, number>,
  legacyCounts: Map<string, number>
): string {
  // Build array with all token counts and sort by Qwen tokens
  const items = Array.from(allStats.entries())
    .filter(([key]) => CHART_LABELS[key])
    .map(([key, stats]) => ({
      label: CHART_LABELS[key],
      qwen: stats.tokens,
      legacy: legacyCounts.get(key) ?? 0,
      claude: claudeCounts.get(key) ?? 0,
    }))
    .sort((a, b) => a.qwen - b.qwen)

  const labels = items.map((i) => i.label)
  const qwenValues = items.map((i) => i.qwen)
  const legacyValues = items.map((i) => i.legacy)
  const claudeValues = items.map((i) => i.claude)

  const allValues = [...qwenValues, ...legacyValues, ...claudeValues].filter((v) => v > 0)
  const maxVal = Math.max(...allValues)
  const yMax = Math.ceil(maxVal / 1000) * 1000 + 1000

  // Check if we have data for each tokenizer
  const hasLegacy = legacyValues.some((v) => v > 0)
  const hasClaude = claudeValues.some((v) => v > 0)

  let lines = `    line "Qwen" [${qwenValues.join(", ")}]`
  if (hasLegacy) {
    lines += `\n    line "Legacy" [${legacyValues.join(", ")}]`
  }
  if (hasClaude) {
    lines += `\n    line "Claude" [${claudeValues.join(", ")}]`
  }

  return `\`\`\`mermaid
xychart-beta
    title "Token Counts by Format"
    x-axis [${labels.map((l) => `"${l}"`).join(", ")}]
    y-axis "Tokens" 0 --> ${yMax}
${lines}
\`\`\``
}

// Per-file chart labels (shorter names for x-axis)
const FILE_LABELS: Record<string, string> = {
  chat: "Chat",
  metrics: "Metrics",
  large: "Large",
  "key-folding-mixed": "KF-mix",
  logs: "Logs",
  firewall: "Firewall",
  small: "Small",
  "github-issue": "Issue",
  "users-50": "Users50",
  medium: "Medium",
  hikes: "Hikes",
  package: "Package",
  "key-folding-basic": "KF-basic",
  irregular: "Irregular",
  "key-folding-with-array": "KF-arr",
  products: "Products",
  routes: "Routes",
}

// Build chart showing % savings vs JSON (mini) for each file
function buildPerFileChart(perFileData: Map<string, PerFileStats>, jsonMiniPerFile: PerFileStats): string {
  // Get all file names from the baseline
  const fileNames = Array.from(jsonMiniPerFile.keys())
    .filter((f) => FILE_LABELS[f])
    // Sort by absolute savings (Jot tokens - JSON tokens), most savings first
    .sort((a, b) => {
      const jotData = perFileData.get("jot")
      const jotA = jotData?.get(a) ?? jsonMiniPerFile.get(a) ?? 0
      const jotB = jotData?.get(b) ?? jsonMiniPerFile.get(b) ?? 0
      const jsonA = jsonMiniPerFile.get(a) ?? 0
      const jsonB = jsonMiniPerFile.get(b) ?? 0
      // Sort by % savings (most negative = most savings)
      const pctA = jsonA > 0 ? ((jotA - jsonA) / jsonA) * 100 : 0
      const pctB = jsonB > 0 ? ((jotB - jsonB) / jsonB) * 100 : 0
      return pctA - pctB
    })

  const labels = fileNames.map((f) => FILE_LABELS[f] || f)

  // Build lines for each format (% change vs JSON mini)
  const formatLines: string[] = []
  let minPct = 0
  let maxPct = 0

  // Order formats by total savings (best first)
  const formatOrder = Array.from(perFileData.entries())
    .filter(([key]) => key !== "json-mini") // Don't show JSON mini (it's the baseline)
    .map(([key, stats]) => {
      let totalPct = 0
      for (const file of fileNames) {
        const baseline = jsonMiniPerFile.get(file) ?? 0
        const val = stats.get(file) ?? 0
        if (baseline > 0) {
          totalPct += ((val - baseline) / baseline) * 100
        }
      }
      return { key, avgPct: totalPct / fileNames.length }
    })
    .sort((a, b) => a.avgPct - b.avgPct)
    .map((f) => f.key)

  for (const formatKey of formatOrder) {
    const stats = perFileData.get(formatKey)
    if (!stats) continue

    const label = CHART_LABELS[formatKey] || formatKey
    const pctValues = fileNames.map((f) => {
      const baseline = jsonMiniPerFile.get(f) ?? 0
      const val = stats.get(f) ?? 0
      if (baseline === 0) return 0
      return Math.round(((val - baseline) / baseline) * 100)
    })
    minPct = Math.min(minPct, ...pctValues)
    maxPct = Math.max(maxPct, ...pctValues)
    formatLines.push(`    line "${label}" [${pctValues.join(", ")}]`)
  }

  // Round y-axis to nice values
  const yMin = Math.floor(minPct / 10) * 10 - 10
  const yMax = Math.ceil(maxPct / 10) * 10 + 10

  return `\`\`\`mermaid
xychart-beta
    title "Token Savings vs JSON (negative = better)"
    x-axis [${labels.map((l) => `"${l}"`).join(", ")}]
    y-axis "% vs JSON" ${yMin} --> ${yMax}
${formatLines.join("\n")}
\`\`\``
}

function updateChart(content: string, chart: string): string {
  const startMarker = "<!-- CHART_START -->"
  const endMarker = "<!-- CHART_END -->"
  if (content.includes(startMarker) && content.includes(endMarker)) {
    const before = content.slice(0, content.indexOf(startMarker) + startMarker.length)
    const afterMarker = content.slice(content.indexOf(endMarker))
    return before + "\n" + chart + "\n" + afterMarker
  }
  return content
}

// Cache file for JSON mini/pretty counts (avoid slow LM Studio calls)
const JSON_CACHE_PATH = join(ROOT, "json", "json-counts-cache.json")
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

type JsonCountsCache = {
  timestamp: number
  miniTokens: number
  miniBytes: number
  prettyTokens: number
  prettyBytes: number
}

function loadJsonCountsCache(): JsonCountsCache | null {
  if (!existsSync(JSON_CACHE_PATH)) return null
  try {
    const cache = JSON.parse(readFileSync(JSON_CACHE_PATH, "utf-8")) as JsonCountsCache
    if (Date.now() - cache.timestamp < CACHE_MAX_AGE_MS) {
      return cache
    }
  } catch {
    // Invalid cache
  }
  return null
}

function saveJsonCountsCache(cache: JsonCountsCache) {
  writeFileSync(JSON_CACHE_PATH, JSON.stringify(cache, null, 2))
}

async function main() {
  const allStats: Map<string, FormatStats> = new Map()
  const perFileData: Map<string, PerFileStats> = new Map() // for per-file chart
  const claudeCounts = parseClaudeCounts()
  const hasClaude = claudeCounts.size > 0

  console.log("Computing legacy tokenizer counts...")
  const legacyCounts = computeLegacyCounts()
  const hasLegacy = legacyCounts.size > 0
  console.log(`Computed ${legacyCounts.size} legacy token counts`)

  if (hasClaude) {
    console.log(`Loaded ${claudeCounts.size} Claude token counts`)
  }

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
      // Collect per-file data for jot (compact format only)
      perFileData.set("jot", parsePerFileCountsFile(content, "jot"))
    } else if (dir.name === "json") {
      // Get smart JSON stats from counts.txt
      const smartStats = stats.get("smart.json")
      if (smartStats) allStats.set("json-smart", smartStats)

      // Try to use cached JSON mini/pretty counts
      const cache = loadJsonCountsCache()
      if (cache) {
        console.log("Using cached JSON mini/pretty counts")
        allStats.set("json-mini", { tokens: cache.miniTokens, bytes: cache.miniBytes })
        allStats.set("json-pretty", { tokens: cache.prettyTokens, bytes: cache.prettyBytes })
      } else {
        // Count both minified and standard pretty JSON (slow, requires LM Studio)
        const jsonDir = join(ROOT, "json")
        let miniTokens = 0, miniBytes = 0
        let prettyTokens = 0, prettyBytes = 0

        console.log("Counting JSON tokens (slow, caching result)...")
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

        allStats.set("json-mini", { tokens: miniTokens, bytes: miniBytes })
        allStats.set("json-pretty", { tokens: prettyTokens, bytes: prettyBytes })

        // Cache the results
        saveJsonCountsCache({
          timestamp: Date.now(),
          miniTokens,
          miniBytes,
          prettyTokens,
          prettyBytes,
        })
      }

      console.log(`  smart:    ${smartStats?.tokens} tokens, ${smartStats?.bytes} bytes`)
    } else {
      const ext = Array.from(stats.keys())[0]
      if (ext) {
        allStats.set(dir.name, stats.get(ext)!)
        // Collect per-file data for this format
        perFileData.set(dir.name, parsePerFileCountsFile(content))
      }
    }
  }

  // Build compact table
  const compactRows = COMPACT_FORMATS
    .filter((k) => allStats.has(k))
    .map((k) => ({ key: k, ...allStats.get(k)! }))
  const compactTable = buildTable(compactRows, "json-mini", claudeCounts, legacyCounts)

  // Build pretty table
  const prettyRows = PRETTY_FORMATS
    .filter((k) => allStats.has(k))
    .map((k) => ({ key: k, ...allStats.get(k)! }))
  const prettyTable = buildTable(prettyRows, "json-pretty", claudeCounts, legacyCounts)

  // Build chart
  const chart = buildChart(allStats, claudeCounts, legacyCounts)

  // Update SUMMARY.md
  let summary = readFileSync(SUMMARY_PATH, "utf-8")
  summary = updateChart(summary, chart)
  summary = updateSection(summary, "<!-- COMPACT_START -->", "<!-- COMPACT_END -->", compactTable, hasLegacy, hasClaude)
  summary = updateSection(summary, "<!-- PRETTY_START -->", "<!-- PRETTY_END -->", prettyTable, hasLegacy, hasClaude)
  writeFileSync(SUMMARY_PATH, summary)

  // Update TOKEN_COUNTS.md with per-file chart (% savings vs JSON)
  if (existsSync(TOKEN_COUNTS_PATH)) {
    let tokenCounts = readFileSync(TOKEN_COUNTS_PATH, "utf-8")
    const jsonMiniPerFile = computeJsonMiniPerFile()
    const perFileChart = buildPerFileChart(perFileData, jsonMiniPerFile)
    tokenCounts = updateChart(tokenCounts, perFileChart)
    writeFileSync(TOKEN_COUNTS_PATH, tokenCounts)
    console.log("Updated TOKEN_COUNTS.md")
  }

  console.log("Updated SUMMARY.md")
}

main()
