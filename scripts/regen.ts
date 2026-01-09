#!/usr/bin/env bun
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { join, dirname } from "node:path"

const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
const SCRIPT_DIR = dirname(import.meta.path)
const ROOT = join(SCRIPT_DIR, "..", "encoding-formats")
// Automatically gets list of docs from filenames in json folder

const DOCS = readdirSync(join(ROOT, "json"))
  .filter((f: string) => f.endsWith(".json"))
  .map((f: string) => f.slice(0, -5)) // Remove .json extension

async function countTokens(content: string): Promise<number> {
  const response = await fetch(LM_STUDIO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content }],
      max_tokens: 1,
    }),
  })
  const data = await response.json() as { usage?: { prompt_tokens: number } }
  return data.usage?.prompt_tokens ?? -1
}

// Regenerate all formats
console.log("Regenerating formats...")
for (const dir of readdirSync(ROOT, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  const genPath = join(ROOT, dir.name, "gen.ts")
  if (existsSync(genPath)) {
    execSync("bun gen.ts", { cwd: join(ROOT, dir.name), stdio: "inherit" })
  }
}

// Find extension for a format directory
function getExtension(formatDir: string): string | null {
  const files = readdirSync(formatDir).filter(f => !f.endsWith(".ts") && f.includes("."))
  if (files.length === 0) return null
  return files[0].split(".").pop() || null
}

// Count tokens for all formats
console.log("\nCounting tokens...\n")

type Row = { format: string; tokens: number[]; total: number; bytes: number }
const rows: Row[] = []

// Process each format directory
const SKIP_DIRS = ["json"]
for (const dir of readdirSync(ROOT, { withFileTypes: true })) {
  if (!dir.isDirectory() || SKIP_DIRS.includes(dir.name)) continue

  const formatDir = join(ROOT, dir.name)
  const ext = getExtension(formatDir)
  if (!ext) continue

  const tokens: number[] = []
  let total = 0
  let bytes = 0

  for (const doc of DOCS) {
    const filePath = join(formatDir, `${doc}.${ext}`)
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8")
      const count = await countTokens(content)
      console.log(`Counted ${count} tokens for ${dir.name}/${doc}.${ext}`)
      tokens.push(count)
      total += count
      bytes += new TextEncoder().encode(content).length
    } else {
      tokens.push(-1)
      total += 9999 // Sort missing to bottom
    }
  }

  rows.push({ format: dir.name, tokens, total, bytes })
}

// Add JSON baseline (minified)
const jsonTokens: number[] = []
let jsonTotal = 0
let jsonBytes = 0
for (const doc of DOCS) {
  const filePath = join(ROOT, "json", `${doc}.json`)
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, "utf-8")
    const minified = JSON.stringify(JSON.parse(content))
    const count = await countTokens(minified)
    jsonTokens.push(count)
    jsonTotal += count
    jsonBytes += new TextEncoder().encode(minified).length
  } else {
    jsonTokens.push(-1)
  }
}
rows.push({ format: "JSON (mini)", tokens: jsonTokens, total: jsonTotal, bytes: jsonBytes })

// Sort by total
rows.sort((a, b) => a.total - b.total)

// Build table as string
const header = `| Format | ${DOCS.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(" | ")} | Total | Bytes |`
const separator = `|--------|${DOCS.map(() => "------:").join("|")}|------:|------:|`

let table = header + "\n" + separator + "\n"

for (const row of rows) {
  const tokenCells = row.tokens.map(t => t === -1 ? "-" : String(t)).join(" | ")
  const actualTotal = row.tokens.reduce((sum, t) => sum + (t === -1 ? 0 : t), 0)
  table += `| ${row.format} | ${tokenCells} | ${actualTotal} | ${row.bytes.toLocaleString()} |\n`
}

console.log(table)
writeFileSync(join(ROOT, "TOKEN_COUNTS.md"), table)
console.log("Token counts written to TOKEN_COUNTS.md")