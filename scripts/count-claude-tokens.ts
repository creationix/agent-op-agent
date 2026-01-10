#!/usr/bin/env bun
// Count tokens using Claude API (accurate for Claude 3/3.5/4)
// Usage: ANTHROPIC_API_KEY=... bun scripts/count-claude-tokens.ts [model]
// Models: sonnet (default), opus, haiku
// Cost: FREE (token counting endpoint has no usage cost, only rate limits)
// Note: Requires API key - org members may need admin to enable API access
// Output: Saves results to encoding-formats/claude-counts.txt

import Anthropic from "@anthropic-ai/sdk"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"

const SCRIPT_DIR = dirname(import.meta.path)
const ROOT = join(SCRIPT_DIR, "..", "encoding-formats")

const MODELS: Record<string, string> = {
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-20250514",
  haiku: "claude-3-5-haiku-20241022",
}

const modelArg = process.argv[2]?.toLowerCase() || "sonnet"
const MODEL = MODELS[modelArg] || MODELS.sonnet
const MODEL_NAME = Object.entries(MODELS).find(([, v]) => v === MODEL)?.[0] || "sonnet"
const OUTPUT_FILE = join(ROOT, `claude-counts-${MODEL_NAME}.txt`)

const client = new Anthropic()

async function countTokens(content: string): Promise<number> {
  // Use dedicated token counting endpoint (no response generation, more efficient)
  const response = await client.messages.countTokens({
    model: MODEL,
    messages: [{ role: "user", content }],
  })
  return response.input_tokens
}

// Get all source JSON files (excluding .smart.json)
function getSourceFiles(): string[] {
  return readdirSync(join(ROOT, "json"))
    .filter((f) => f.endsWith(".json") && !f.includes(".smart."))
    .map((f) => f.replace(".json", ""))
}

type FormatDef = {
  name: string
  getContent: (baseName: string) => string
}

async function main() {
  const testFiles = getSourceFiles()

  const formats: FormatDef[] = [
    {
      name: "JSON (mini)",
      getContent: (f) => JSON.stringify(JSON.parse(readFileSync(join(ROOT, "json", `${f}.json`), "utf-8"))),
    },
    {
      name: "JSON (pretty)",
      getContent: (f) => JSON.stringify(JSON.parse(readFileSync(join(ROOT, "json", `${f}.json`), "utf-8")), null, 2),
    },
    {
      name: "JSON (smart)",
      getContent: (f) => readFileSync(join(ROOT, "json", `${f}.smart.json`), "utf-8"),
    },
    { name: "Jot", getContent: (f) => readFileSync(join(ROOT, "jot", `${f}.jot`), "utf-8") },
    { name: "Jot (pretty)", getContent: (f) => readFileSync(join(ROOT, "jot", `${f}.pretty.jot`), "utf-8") },
    { name: "JSONito", getContent: (f) => readFileSync(join(ROOT, "jsonito", `${f}.jito`), "utf-8") },
    { name: "TOON", getContent: (f) => readFileSync(join(ROOT, "toon", `${f}.toon`), "utf-8") },
    { name: "YAML", getContent: (f) => readFileSync(join(ROOT, "yaml", `${f}.yaml`), "utf-8") },
    { name: "D2", getContent: (f) => readFileSync(join(ROOT, "d2", `${f}.d2`), "utf-8") },
    { name: "TOML", getContent: (f) => readFileSync(join(ROOT, "toml", `${f}.toml`), "utf-8") },
  ]

  console.log(`Counting tokens for ${testFiles.length} files across ${formats.length} formats using ${MODEL}...\n`)

  const results: Record<string, { tokens: number; files: Record<string, number> }> = {}
  const output: string[] = [`Claude ${MODEL_NAME} Token Counts`, `Model: ${MODEL}`, `Generated: ${new Date().toISOString()}`, ""]

  for (const format of formats) {
    console.log(`=== ${format.name} ===`)
    output.push(`=== ${format.name} ===`)
    results[format.name] = { tokens: 0, files: {} }

    for (const file of testFiles) {
      try {
        const content = format.getContent(file)
        const tokens = await countTokens(content)
        results[format.name].tokens += tokens
        results[format.name].files[file] = tokens
        const line = `  ${file}: ${tokens}`
        console.log(line)
        output.push(line)
      } catch (e) {
        const line = `  ${file}: error`
        console.log(line)
        output.push(line)
      }
    }
    const totalLine = `  Total: ${results[format.name].tokens}`
    console.log(totalLine + "\n")
    output.push(totalLine, "")
  }

  // Summary table
  const summaryHeader = `\n=== SUMMARY (Claude ${MODEL_NAME}) ===\n`
  console.log(summaryHeader)
  output.push(summaryHeader)

  const tableHeader = "Format        | Tokens | vs Mini | vs Pretty"
  const tableSep = "--------------|--------|---------|----------"
  console.log(tableHeader)
  console.log(tableSep)
  output.push(tableHeader, tableSep)

  const jsonMiniTokens = results["JSON (mini)"].tokens
  const jsonPrettyTokens = results["JSON (pretty)"].tokens
  const sorted = Object.entries(results).sort((a, b) => a[1].tokens - b[1].tokens)

  for (const [name, data] of sorted) {
    const vsMini =
      name === "JSON (mini)" ? "baseline" : `${Math.round(((data.tokens - jsonMiniTokens) / jsonMiniTokens) * 100)}%`
    const vsPretty =
      name === "JSON (pretty)"
        ? "baseline"
        : `${Math.round(((data.tokens - jsonPrettyTokens) / jsonPrettyTokens) * 100)}%`
    const line = `${name.padEnd(13)} | ${String(data.tokens).padStart(6)} | ${vsMini.padStart(7)} | ${vsPretty.padStart(8)}`
    console.log(line)
    output.push(line)
  }

  // Save to file
  writeFileSync(OUTPUT_FILE, output.join("\n"), "utf-8")
  console.log(`\nResults saved to ${OUTPUT_FILE}`)
}

main().catch(console.error)
