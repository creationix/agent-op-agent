#!/usr/bin/env bun
// Test LLM accuracy at encoding/decoding formats using FORMAT.md as reference
// Usage: bun scripts/test-llm-accuracy.ts [format] [--encode|--decode|--both]
// Example: bun scripts/test-llm-accuracy.ts jot --encode
//          bun scripts/test-llm-accuracy.ts all --both

import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"

// Import parsers for semantic comparison
import { parse as parseJot } from "../encoding-formats/jot/jot.ts"
import { decode as parseToon } from "@toon-format/toon"

const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
const SCRIPT_DIR = dirname(import.meta.path)
const ROOT = join(SCRIPT_DIR, "..", "encoding-formats")

// Format-specific parsers for semantic comparison
const PARSERS: Record<string, (s: string) => unknown> = {
  jot: parseJot,
  toon: parseToon,
}

// Formats with FORMAT.md files
const SUPPORTED_FORMATS = ["jot", "toon"]

// Test files to use (smaller subset for faster testing)
const TEST_FILES = ["small", "medium", "package"]

interface TestResult {
  file: string
  type: "encode" | "decode"
  success: boolean
  semantic: boolean // true if data matches even if format differs
  expected: string
  actual: string
  error?: string
}

interface FormatResults {
  format: string
  encodeAccuracy: number
  decodeAccuracy: number
  encodeSemanticAccuracy: number
  decodeSemanticAccuracy: number
  results: TestResult[]
}

async function chat(
  prompt: string,
  systemPrompt: string,
  temperature = 0
): Promise<string> {
  const response = await fetch(LM_STUDIO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature,
      max_tokens: 4096,
    }),
  })
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return data.choices?.[0]?.message?.content?.trim() ?? ""
}

function normalizeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function normalizeOutput(s: string): string {
  // Extract content from markdown code blocks if present
  const codeBlockMatch = s.match(/```(?:\w+)?\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    s = codeBlockMatch[1]
  }
  return s.trim()
}

function compareJson(a: string, b: string): boolean {
  const parsedA = normalizeJson(a)
  const parsedB = normalizeJson(b)
  if (parsedA === null || parsedB === null) return false
  return JSON.stringify(parsedA) === JSON.stringify(parsedB)
}

function compareFormat(actual: string, expected: string): boolean {
  // Normalize whitespace and compare
  const normActual = normalizeOutput(actual).replace(/\s+/g, " ").trim()
  const normExpected = expected.replace(/\s+/g, " ").trim()
  return normActual === normExpected
}

// Semantic comparison: parse the LLM output and compare JSON structures
function semanticCompare(
  format: string,
  llmOutput: string,
  expectedJson: string
): boolean {
  const parser = PARSERS[format]
  if (!parser) return false

  try {
    const normalized = normalizeOutput(llmOutput)
    const parsed = parser(normalized)
    const expected = JSON.parse(expectedJson)
    return JSON.stringify(parsed) === JSON.stringify(expected)
  } catch {
    return false
  }
}

function getExtension(format: string): string {
  return format // jot -> .jot, toon -> .toon
}

async function testEncode(
  format: string,
  formatSpec: string,
  jsonContent: string,
  expectedOutput: string,
  fileName: string
): Promise<TestResult> {
  const systemPrompt = `You are a data format encoder. Given a FORMAT specification and JSON input, output ONLY the encoded result with no explanation or markdown formatting.

FORMAT SPECIFICATION:
${formatSpec}`

  const prompt = `Encode this JSON to ${format.toUpperCase()} format. Output ONLY the encoded result, nothing else:

${jsonContent}`

  try {
    const actual = await chat(prompt, systemPrompt)
    const normalizedActual = normalizeOutput(actual)
    const success = compareFormat(normalizedActual, expectedOutput)
    // Semantic: does the LLM output parse back to the original JSON?
    const semantic = semanticCompare(format, normalizedActual, jsonContent)

    return {
      file: fileName,
      type: "encode",
      success,
      semantic,
      expected: expectedOutput.slice(0, 200),
      actual: normalizedActual.slice(0, 200),
    }
  } catch (e) {
    return {
      file: fileName,
      type: "encode",
      success: false,
      semantic: false,
      expected: expectedOutput.slice(0, 200),
      actual: "",
      error: (e as Error).message,
    }
  }
}

async function testDecode(
  format: string,
  formatSpec: string,
  encodedContent: string,
  expectedJson: string,
  fileName: string
): Promise<TestResult> {
  const systemPrompt = `You are a data format decoder. Given a FORMAT specification and encoded input, output ONLY valid JSON with no explanation or markdown formatting.

FORMAT SPECIFICATION:
${formatSpec}`

  const prompt = `Decode this ${format.toUpperCase()} to JSON. Output ONLY valid JSON, nothing else:

${encodedContent}`

  try {
    const actual = await chat(prompt, systemPrompt)
    const normalizedActual = normalizeOutput(actual)
    const success = compareJson(normalizedActual, expectedJson)
    // For decode, semantic is same as success (both compare JSON)
    const semantic = success

    return {
      file: fileName,
      type: "decode",
      success,
      semantic,
      expected: JSON.stringify(JSON.parse(expectedJson)).slice(0, 200),
      actual: normalizedActual.slice(0, 200),
    }
  } catch (e) {
    return {
      file: fileName,
      type: "decode",
      success: false,
      semantic: false,
      expected: expectedJson.slice(0, 200),
      actual: "",
      error: (e as Error).message,
    }
  }
}

async function testFormat(
  format: string,
  runEncode: boolean,
  runDecode: boolean
): Promise<FormatResults> {
  const formatDir = join(ROOT, format)
  const formatMdPath = join(formatDir, "FORMAT.md")

  if (!existsSync(formatMdPath)) {
    console.error(`No FORMAT.md found for ${format}`)
    return {
      format,
      encodeAccuracy: 0,
      decodeAccuracy: 0,
      results: [],
    }
  }

  const formatSpec = readFileSync(formatMdPath, "utf-8")
  const ext = getExtension(format)
  const results: TestResult[] = []

  console.log(`\n${"=".repeat(50)}`)
  console.log(`Testing ${format.toUpperCase()}`)
  console.log(`${"=".repeat(50)}`)

  for (const testName of TEST_FILES) {
    const jsonPath = join(ROOT, "json", `${testName}.json`)
    const encodedPath = join(formatDir, `${testName}.${ext}`)

    if (!existsSync(jsonPath) || !existsSync(encodedPath)) {
      console.log(`  Skipping ${testName} (missing files)`)
      continue
    }

    const jsonContent = readFileSync(jsonPath, "utf-8")
    const encodedContent = readFileSync(encodedPath, "utf-8")

    if (runEncode) {
      console.log(`  Encoding ${testName}...`)
      const result = await testEncode(
        format,
        formatSpec,
        jsonContent,
        encodedContent,
        testName
      )
      results.push(result)
      const exactIcon = result.success ? "✓" : "✗"
      const semIcon = result.semantic ? "✓" : "✗"
      console.log(`    ${exactIcon} exact  ${semIcon} semantic`)
      if (!result.semantic) {
        console.log(`      Expected: ${result.expected.slice(0, 80)}...`)
        console.log(`      Actual:   ${result.actual.slice(0, 80)}...`)
      }
    }

    if (runDecode) {
      console.log(`  Decoding ${testName}...`)
      const result = await testDecode(
        format,
        formatSpec,
        encodedContent,
        jsonContent,
        testName
      )
      results.push(result)
      console.log(`    ${result.success ? "✓" : "✗"} decode`)
      if (!result.success) {
        console.log(`      Expected: ${result.expected.slice(0, 80)}...`)
        console.log(`      Actual:   ${result.actual.slice(0, 80)}...`)
      }
    }
  }

  const encodeResults = results.filter((r) => r.type === "encode")
  const decodeResults = results.filter((r) => r.type === "decode")

  const encodeAccuracy =
    encodeResults.length > 0
      ? encodeResults.filter((r) => r.success).length / encodeResults.length
      : 0

  const decodeAccuracy =
    decodeResults.length > 0
      ? decodeResults.filter((r) => r.success).length / decodeResults.length
      : 0

  const encodeSemanticAccuracy =
    encodeResults.length > 0
      ? encodeResults.filter((r) => r.semantic).length / encodeResults.length
      : 0

  const decodeSemanticAccuracy =
    decodeResults.length > 0
      ? decodeResults.filter((r) => r.semantic).length / decodeResults.length
      : 0

  return { format, encodeAccuracy, decodeAccuracy, encodeSemanticAccuracy, decodeSemanticAccuracy, results }
}

function printSummary(allResults: FormatResults[]) {
  console.log(`\n${"=".repeat(60)}`)
  console.log("SUMMARY")
  console.log(`${"=".repeat(60)}`)

  console.log("\nExact match (format matches reference encoder):")
  console.log(
    `${"Format".padEnd(10)} ${"Encode".padStart(10)} ${"Decode".padStart(10)}`
  )
  console.log(`${"-".repeat(10)} ${"-".repeat(10)} ${"-".repeat(10)}`)

  for (const result of allResults) {
    const encPct =
      result.encodeAccuracy > 0
        ? `${(result.encodeAccuracy * 100).toFixed(0)}%`
        : "-"
    const decPct =
      result.decodeAccuracy > 0
        ? `${(result.decodeAccuracy * 100).toFixed(0)}%`
        : "-"
    console.log(
      `${result.format.padEnd(10)} ${encPct.padStart(10)} ${decPct.padStart(10)}`
    )
  }

  console.log("\nSemantic (data round-trips correctly):")
  console.log(
    `${"Format".padEnd(10)} ${"Encode".padStart(10)} ${"Decode".padStart(10)}`
  )
  console.log(`${"-".repeat(10)} ${"-".repeat(10)} ${"-".repeat(10)}`)

  for (const result of allResults) {
    const encPct =
      result.encodeSemanticAccuracy > 0
        ? `${(result.encodeSemanticAccuracy * 100).toFixed(0)}%`
        : "-"
    const decPct =
      result.decodeSemanticAccuracy > 0
        ? `${(result.decodeSemanticAccuracy * 100).toFixed(0)}%`
        : "-"
    console.log(
      `${result.format.padEnd(10)} ${encPct.padStart(10)} ${decPct.padStart(10)}`
    )
  }
}

function saveResults(allResults: FormatResults[]) {
  const timestamp = new Date().toISOString().split("T")[0]
  const outPath = join(ROOT, `llm-accuracy-${timestamp}.json`)

  const output = {
    timestamp: new Date().toISOString(),
    testFiles: TEST_FILES,
    results: allResults,
  }

  writeFileSync(outPath, JSON.stringify(output, null, 2))
  console.log(`\nResults saved to ${outPath}`)
}

async function main() {
  const args = process.argv.slice(2)
  const format = args.find((a) => !a.startsWith("--")) || "all"
  const runEncode = args.includes("--encode") || args.includes("--both") || (!args.includes("--decode"))
  const runDecode = args.includes("--decode") || args.includes("--both") || (!args.includes("--encode"))

  // If neither flag specified, run both
  const actualEncode = args.length === 1 || runEncode
  const actualDecode = args.length === 1 || runDecode

  console.log("LLM Format Accuracy Test")
  console.log(`Format: ${format}`)
  console.log(`Tests: ${actualEncode ? "encode" : ""}${actualEncode && actualDecode ? " + " : ""}${actualDecode ? "decode" : ""}`)

  const formats = format === "all" ? SUPPORTED_FORMATS : [format]
  const allResults: FormatResults[] = []

  for (const fmt of formats) {
    if (!SUPPORTED_FORMATS.includes(fmt)) {
      console.error(`Unsupported format: ${fmt}`)
      console.error(`Supported: ${SUPPORTED_FORMATS.join(", ")}`)
      continue
    }

    const results = await testFormat(fmt, actualEncode, actualDecode)
    allResults.push(results)
  }

  printSummary(allResults)
  saveResults(allResults)
}

main()
