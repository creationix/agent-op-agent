#!/usr/bin/env bun
// Verify round-trip encode/decode for all test files
import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import { stringify as jotStringify, parse as jotParse } from "../encoding-formats/jot/jot"
import { stringify as laxStringify, parse as laxParse } from "../encoding-formats/lax/lax"
import { encode as d2Encode, decode as d2Decode } from "../encoding-formats/d2/d2"
import { stringify as jsonitoStringify, parse as jsonitoParse } from "../encoding-formats/jsonito/jsonito"
import { encode as toonEncode, decode as toonDecode } from "@toon-format/toon"
import { stringify as yamlStringify, parse as yamlParse } from "yaml"
import { stringify as tomlStringify, parse as tomlParse } from "smol-toml"

const JSON_DIR = join(import.meta.dir, "../encoding-formats/json")

interface Format {
  name: string
  encode: (d: unknown) => string
  decode: (s: string) => unknown
  allowedToFail?: string
}

const formats: Format[] = [
  { name: "Jot", encode: jotStringify, decode: jotParse },
  { name: "Jot Pretty", encode: d => jotStringify(d, { pretty: true }), decode: jotParse },
  { name: "Lax", encode: laxStringify, decode: laxParse },
  { name: "D2", encode: d2Encode, decode: d2Decode },
  { name: "JSONito", encode: jsonitoStringify, decode: jsonitoParse },
  { name: "Toon", encode: toonEncode, decode: toonDecode },
  {
    name: "Toon KeyFolding", encode: d => toonEncode(d, { keyFolding: "safe" }), decode: toonDecode,
    allowedToFail: "Key folding may lose information in some cases"
  },
  { name: "YAML", encode: yamlStringify, decode: yamlParse },
  {
    name: "TOML", encode: tomlStringify, decode: tomlParse,
    allowedToFail: "TOML limitations (no nulls, no arrays at root)"
  },
]

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function testRoundTrip(
  data: unknown,
  encode: (d: unknown) => string,
  decode: (s: string) => unknown
): { passed: boolean; error?: string; encoded?: string } {
  try {
    const encoded = encode(data)
    const decoded = decode(encoded)
    if (deepEqual(data, decoded)) {
      return { passed: true }
    }
    return { passed: false, error: "Mismatch after decode", encoded }
  } catch (e) {
    return { passed: false, error: (e as Error).message }
  }
}

const files = readdirSync(JSON_DIR).filter(f => f.endsWith(".json"))
const results: { name: string; passed: number; failed: number; allowedToFail?: string }[] = []

for (const format of formats) {
  console.log(`=== ${format.name} Round-trip Tests ===\n`)
  let passed = 0
  let failed = 0

  for (const file of files) {
    const path = join(JSON_DIR, file)
    const content = readFileSync(path, "utf-8")
    const data = JSON.parse(content)

    const result = testRoundTrip(data, format.encode, format.decode)
    if (result.passed) {
      console.log(`✓ ${file}`)
      passed++
    } else {
      console.log(`✗ ${file}`)
      console.log(`  error: ${result.error}`)
      if (result.encoded) {
        console.log(`  encoded (first 200 chars): ${result.encoded.slice(0, 200)}`)
      }
      failed++
    }
  }

  const suffix = format.allowedToFail ? ` (${format.allowedToFail})` : ""
  console.log(`\n${format.name}: ${passed} passed, ${failed} failed${suffix}\n`)
  results.push({ name: format.name, passed, failed, allowedToFail: format.allowedToFail })
}

console.log("=== Summary ===")
for (const { name, passed, failed, allowedToFail } of results) {
  const suffix = allowedToFail ? ` (${allowedToFail})` : ""
  console.log(`${name}: ${passed}/${passed + failed} tests passed${suffix}`)
}

const fatalFailures = results.filter(r => r.failed > 0 && !r.allowedToFail)
if (fatalFailures.length > 0) {
  process.exit(1)
}
