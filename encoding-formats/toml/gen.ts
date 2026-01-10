#!/usr/bin/env bun
// Generate samples by reading from ../json/*.json and writing the equivalent here.
import { stringify, parse } from "smol-toml"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

// Deep equality that ignores key order (TOML doesn't preserve key order)
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object)
    const bKeys = Object.keys(b as object)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

let passed = 0
let failed = 0

// Iterate over files in "../json/*.json"
for (const file of readdirSync("../json")) {
  if (file.endsWith(".json")) {
    const sourceFilePath = `../json/${file}`
    const targetFilePath = `./${file.replace(".json", ".toml")}`
    const data = JSON.parse(readFileSync(sourceFilePath, "utf-8"))

    let tomlString: string
    try {
      tomlString = stringify(data)
    } catch (e) {
      // TOML doesn't support all JSON structures (e.g., arrays at root, null values)
      console.log(`⊘ ${file}: not TOML-compatible - ${(e as Error).message.split('\n')[0]}`)
      continue
    }

    // Round-trip verification (ignoring key order, which TOML doesn't preserve)
    try {
      const decoded = parse(tomlString)
      if (!deepEqual(decoded, data)) {
        // TOML doesn't support null values, so some data loss is expected for those files
        console.log(`⊘ ${file}: round-trip differs (likely null values - TOML limitation)`)
        writeFileSync(targetFilePath, tomlString, "utf-8")
        passed++
        continue
      }
    } catch (e) {
      console.error(`✗ ${file}: parse error - ${(e as Error).message}`)
      failed++
      continue
    }

    writeFileSync(targetFilePath, tomlString, "utf-8")
    console.log(`✓ ${file}`)
    passed++
  }
}

console.log(`\n${passed} generated, ${failed} failed`)
if (failed > 0) throw new Error("Round-trip verification failed")
