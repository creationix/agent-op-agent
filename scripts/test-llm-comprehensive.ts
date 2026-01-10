#!/usr/bin/env bun
// Comprehensive LLM accuracy test - all docs, multiple runs, minified JSON
// Usage: bun scripts/test-llm-comprehensive.ts [format|all] [runs=3]

import { readdirSync, readFileSync, existsSync, writeFileSync, appendFileSync } from "node:fs"
import { join, dirname } from "node:path"

// Import parsers for semantic comparison
import { parse as parseJot } from "../encoding-formats/jot/jot.ts"
import { decode as parseToon } from "@toon-format/toon"

const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
const SCRIPT_DIR = dirname(import.meta.path)
const ROOT = join(SCRIPT_DIR, "..", "encoding-formats")
const CONVERSATION_LOG = join(ROOT, "llm-conversations.log")

// Initialize conversation log
function initLog() {
  writeFileSync(CONVERSATION_LOG, `=== LLM Conversation Log ===\nStarted: ${new Date().toISOString()}\n\n`)
}

function logConversation(
  format: string,
  doc: string,
  run: number,
  systemPrompt: string,
  userPrompt: string,
  response: string,
  exactMatch: boolean,
  semantic: boolean
) {
  let status: string
  if (exactMatch) {
    status = "🎯 EXACT MATCH"
  } else if (semantic) {
    status = "✅ SEMANTIC MATCH"
  } else {
    status = "❌ FAILED"
  }

  const entry = `
${"=".repeat(80)}
[${new Date().toISOString()}] ${format}/${doc} run ${run}
${status}
${"=".repeat(80)}

🧪 SYSTEM PROMPT (test harness):
${systemPrompt.slice(0, 500)}${systemPrompt.length > 500 ? "\n... (truncated)" : ""}

📝 USER PROMPT (test harness):
${userPrompt.slice(0, 1000)}${userPrompt.length > 1000 ? "\n... (truncated)" : ""}

🤖 QWEN RESPONSE:
${response.slice(0, 2000)}${response.length > 2000 ? "\n... (truncated)" : ""}

`
  appendFileSync(CONVERSATION_LOG, entry)
}

const PARSERS: Record<string, (s: string) => unknown> = {
  jot: parseJot,
  toon: parseToon,
}

const SUPPORTED_FORMATS = ["jot", "toon"]

interface RunResult {
  run: number
  exactMatch: boolean
  semantic: boolean
  actual: string
  error?: string
}

interface DocResult {
  doc: string
  runs: RunResult[]
  exactRate: number
  semanticRate: number
}

interface FormatResult {
  format: string
  docs: DocResult[]
  overallExactRate: number
  overallSemanticRate: number
  totalRuns: number
  exactPasses: number
  semanticPasses: number
}

async function chat(prompt: string, systemPrompt: string): Promise<string> {
  const response = await fetch(LM_STUDIO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.1, // Small temp for slight variation between runs
      max_tokens: 8192,
    }),
  })
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return data.choices?.[0]?.message?.content?.trim() ?? ""
}

function normalizeOutput(s: string): string {
  const codeBlockMatch = s.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    s = codeBlockMatch[1]
  }
  return s.trim()
}

function compareExact(actual: string, expected: string): boolean {
  const normActual = normalizeOutput(actual).replace(/\s+/g, " ").trim()
  const normExpected = expected.replace(/\s+/g, " ").trim()
  return normActual === normExpected
}

function compareSemantic(
  format: string,
  llmOutput: string,
  originalJson: string
): boolean {
  const parser = PARSERS[format]
  if (!parser) return false

  try {
    const normalized = normalizeOutput(llmOutput)
    const parsed = parser(normalized)
    const expected = JSON.parse(originalJson)
    return JSON.stringify(parsed) === JSON.stringify(expected)
  } catch {
    return false
  }
}

function getTestDocs(): string[] {
  return readdirSync(join(ROOT, "json"))
    .filter((f) => f.endsWith(".json") && !f.includes("smart") && !f.includes("cache"))
    .map((f) => f.replace(".json", ""))
}

async function testDoc(
  format: string,
  formatSpec: string,
  docName: string,
  numRuns: number
): Promise<DocResult> {
  const jsonPath = join(ROOT, "json", `${docName}.json`)
  const encodedPath = join(ROOT, format, `${docName}.${format}`)

  const jsonData = JSON.parse(readFileSync(jsonPath, "utf-8"))
  const minifiedJson = JSON.stringify(jsonData) // Minified
  const expectedEncoded = existsSync(encodedPath)
    ? readFileSync(encodedPath, "utf-8")
    : null

  const systemPrompt = `You are a data format encoder. Given a FORMAT specification and JSON input, output ONLY the encoded result with no explanation, comments, or markdown formatting.

FORMAT SPECIFICATION:
${formatSpec}`

  const prompt = `Encode this JSON to ${format.toUpperCase()} format. Output ONLY the encoded result, nothing else:

${minifiedJson}`

  const runs: RunResult[] = []

  for (let run = 1; run <= numRuns; run++) {
    try {
      const actual = await chat(prompt, systemPrompt)
      const normalized = normalizeOutput(actual)

      const exactMatch = expectedEncoded
        ? compareExact(normalized, expectedEncoded)
        : false
      const semantic = compareSemantic(format, normalized, minifiedJson)

      // Log conversation
      logConversation(format, docName, run, systemPrompt, prompt, actual, exactMatch, semantic)

      runs.push({
        run,
        exactMatch,
        semantic,
        actual: normalized.slice(0, 300),
      })
    } catch (e) {
      logConversation(format, docName, run, systemPrompt, prompt, (e as Error).message, false, false)
      runs.push({
        run,
        exactMatch: false,
        semantic: false,
        actual: "",
        error: (e as Error).message,
      })
    }

    // Small delay between runs
    await new Promise((r) => setTimeout(r, 100))
  }

  const exactPasses = runs.filter((r) => r.exactMatch).length
  const semanticPasses = runs.filter((r) => r.semantic).length

  return {
    doc: docName,
    runs,
    exactRate: exactPasses / numRuns,
    semanticRate: semanticPasses / numRuns,
  }
}

async function testFormat(
  format: string,
  numRuns: number
): Promise<FormatResult> {
  const formatMdPath = join(ROOT, format, "FORMAT.md")
  if (!existsSync(formatMdPath)) {
    console.error(`No FORMAT.md found for ${format}`)
    return {
      format,
      docs: [],
      overallExactRate: 0,
      overallSemanticRate: 0,
      totalRuns: 0,
      exactPasses: 0,
      semanticPasses: 0,
    }
  }

  const formatSpec = readFileSync(formatMdPath, "utf-8")
  const testDocs = getTestDocs()
  const docs: DocResult[] = []

  console.log(`\n${"=".repeat(60)}`)
  console.log(`Testing ${format.toUpperCase()} (${numRuns} runs per doc)`)
  console.log(`${"=".repeat(60)}`)

  for (const docName of testDocs) {
    const encodedPath = join(ROOT, format, `${docName}.${format}`)
    if (!existsSync(encodedPath)) {
      console.log(`  ${docName}: skipped (no reference)`)
      continue
    }

    process.stdout.write(`  ${docName}...`)
    const result = await testDoc(format, formatSpec, docName, numRuns)
    docs.push(result)

    const exactPct = (result.exactRate * 100).toFixed(0)
    const semPct = (result.semanticRate * 100).toFixed(0)
    console.log(` exact:${exactPct}% semantic:${semPct}%`)

    // Show failures
    const failures = result.runs.filter((r) => !r.semantic)
    if (failures.length > 0 && failures.length < numRuns) {
      for (const f of failures.slice(0, 2)) {
        console.log(`    run ${f.run} failed: ${f.actual.slice(0, 60)}...`)
      }
    }
  }

  const totalRuns = docs.reduce((sum, d) => sum + d.runs.length, 0)
  const exactPasses = docs.reduce(
    (sum, d) => sum + d.runs.filter((r) => r.exactMatch).length,
    0
  )
  const semanticPasses = docs.reduce(
    (sum, d) => sum + d.runs.filter((r) => r.semantic).length,
    0
  )

  return {
    format,
    docs,
    overallExactRate: totalRuns > 0 ? exactPasses / totalRuns : 0,
    overallSemanticRate: totalRuns > 0 ? semanticPasses / totalRuns : 0,
    totalRuns,
    exactPasses,
    semanticPasses,
  }
}

function printSummary(results: FormatResult[]) {
  console.log(`\n${"=".repeat(60)}`)
  console.log("SUMMARY")
  console.log(`${"=".repeat(60)}`)

  console.log(
    `\n${"Format".padEnd(10)} ${"Exact".padStart(12)} ${"Semantic".padStart(12)} ${"Runs".padStart(8)}`
  )
  console.log(`${"-".repeat(10)} ${"-".repeat(12)} ${"-".repeat(12)} ${"-".repeat(8)}`)

  for (const r of results) {
    const exactPct = `${(r.overallExactRate * 100).toFixed(1)}%`
    const semPct = `${(r.overallSemanticRate * 100).toFixed(1)}%`
    const runsStr = `${r.semanticPasses}/${r.totalRuns}`
    console.log(
      `${r.format.padEnd(10)} ${exactPct.padStart(12)} ${semPct.padStart(12)} ${runsStr.padStart(8)}`
    )
  }

  // Per-doc breakdown
  console.log(`\nPer-document semantic accuracy:`)
  console.log(`${"Doc".padEnd(25)} ${results.map((r) => r.format.padStart(8)).join("")}`)
  console.log(`${"-".repeat(25)} ${results.map(() => "-".repeat(8)).join("")}`)

  const allDocs = new Set(results.flatMap((r) => r.docs.map((d) => d.doc)))
  for (const doc of [...allDocs].sort()) {
    const rates = results.map((r) => {
      const d = r.docs.find((x) => x.doc === doc)
      return d ? `${(d.semanticRate * 100).toFixed(0)}%` : "-"
    })
    console.log(`${doc.padEnd(25)} ${rates.map((r) => r.padStart(8)).join("")}`)
  }
}

function saveResults(results: FormatResult[], numRuns: number) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outPath = join(ROOT, `llm-comprehensive-${timestamp}.json`)

  const output = {
    timestamp: new Date().toISOString(),
    runsPerDoc: numRuns,
    summary: results.map((r) => ({
      format: r.format,
      exactRate: r.overallExactRate,
      semanticRate: r.overallSemanticRate,
      totalRuns: r.totalRuns,
      exactPasses: r.exactPasses,
      semanticPasses: r.semanticPasses,
    })),
    details: results,
  }

  writeFileSync(outPath, JSON.stringify(output, null, 2))
  console.log(`\nResults saved to ${outPath}`)
}

async function main() {
  const args = process.argv.slice(2)
  const format = args.find((a) => !a.startsWith("--") && isNaN(Number(a))) || "all"
  const numRuns = Number(args.find((a) => !isNaN(Number(a)))) || 3

  // Initialize conversation log
  initLog()
  console.log(`Conversation log: ${CONVERSATION_LOG}`)
  console.log("  tail -f encoding-formats/llm-conversations.log")
  console.log("")

  console.log("Comprehensive LLM Format Accuracy Test")
  console.log(`Format: ${format}`)
  console.log(`Runs per doc: ${numRuns}`)
  console.log(`Test docs: ${getTestDocs().length}`)

  const formats = format === "all" ? SUPPORTED_FORMATS : [format]
  const results: FormatResult[] = []

  for (const fmt of formats) {
    if (!SUPPORTED_FORMATS.includes(fmt)) {
      console.error(`Unsupported format: ${fmt}`)
      continue
    }
    const result = await testFormat(fmt, numRuns)
    results.push(result)
  }

  printSummary(results)
  saveResults(results, numRuns)
}

main()
