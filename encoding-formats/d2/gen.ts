#!/usr/bin/env bun
// Generate samples by reading from ../json/*.json and writing the equivalent here.
// Uses bun runtime
import { encode, decode } from "./d2.ts"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

let passed = 0
let failed = 0

// Iterate over files in "../json/*.json"
for (const file of readdirSync("../json")) {
  if (file.endsWith(".json")) {
    const sourceFilePath = `../json/${file}`
    const targetFilePath = `./${file.replace(".json", ".d2")}`
    const data = JSON.parse(readFileSync(sourceFilePath, "utf-8"))
    const d2String = encode(data)

    // Round-trip verification
    try {
      const decoded = decode(d2String)
      if (JSON.stringify(decoded) !== JSON.stringify(data)) {
        console.error(`✗ ${file}: round-trip mismatch`)
        failed++
        continue
      }
    } catch (e) {
      console.error(`✗ ${file}: parse error - ${(e as Error).message}`)
      failed++
      continue
    }

    writeFileSync(targetFilePath, d2String, "utf-8")
    console.log(`✓ ${file}`)
    passed++
  }
}

console.log(`\n${passed} generated, ${failed} failed`)
if (failed > 0) throw new Error("Round-trip verification failed")
