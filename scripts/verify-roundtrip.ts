// Verify round-trip encode/decode for all test files
import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import { stringify as jotStringify, parse as jotParse } from "../encoding-formats/jot/jot"
import { stringify as laxStringify, parse as laxParse } from "../encoding-formats/lax/lax"

const JSON_DIR = join(import.meta.dir, "../encoding-formats/json")

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function testRoundTrip(
  name: string,
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
    return {
      passed: false,
      error: `Mismatch after decode`,
      encoded,
    }
  } catch (e) {
    return {
      passed: false,
      error: (e as Error).message,
    }
  }
}

const files = readdirSync(JSON_DIR).filter(f => f.endsWith(".json"))

let jotPassed = 0
let jotFailed = 0
let laxPassed = 0
let laxFailed = 0

console.log("=== Jot Round-trip Tests ===\n")

for (const file of files) {
  const path = join(JSON_DIR, file)
  const content = readFileSync(path, "utf-8")
  const data = JSON.parse(content)

  const result = testRoundTrip(file, data, jotStringify, jotParse)
  if (result.passed) {
    console.log(`✓ ${file}`)
    jotPassed++
  } else {
    console.log(`✗ ${file}`)
    console.log(`  error: ${result.error}`)
    if (result.encoded) {
      console.log(`  encoded (first 200 chars): ${result.encoded.slice(0, 200)}`)
    }
    jotFailed++
  }
}

console.log(`\nJot: ${jotPassed} passed, ${jotFailed} failed`)

console.log("\n=== Lax Round-trip Tests ===\n")

for (const file of files) {
  const path = join(JSON_DIR, file)
  const content = readFileSync(path, "utf-8")
  const data = JSON.parse(content)

  const result = testRoundTrip(file, data, laxStringify, laxParse)
  if (result.passed) {
    console.log(`✓ ${file}`)
    laxPassed++
  } else {
    console.log(`✗ ${file}`)
    console.log(`  error: ${result.error}`)
    if (result.encoded) {
      console.log(`  encoded (first 200 chars): ${result.encoded.slice(0, 200)}`)
    }
    laxFailed++
  }
}

console.log(`\nLax: ${laxPassed} passed, ${laxFailed} failed`)

console.log("\n=== Summary ===")
console.log(`Jot: ${jotPassed}/${jotPassed + jotFailed} tests passed`)
console.log(`Lax: ${laxPassed}/${laxPassed + laxFailed} tests passed`)

if (jotFailed > 0 || laxFailed > 0) {
  process.exit(1)
}
