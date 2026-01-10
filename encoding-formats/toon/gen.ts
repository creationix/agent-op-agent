#!/usr/bin/env bun
// Generate samples by reading from ../json/*.json and writing the equivalent here.
import { encode, decode } from '@toon-format/toon'
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

let passed = 0
let failed = 0

// Iterate over files in "../json/*.json"
for (const file of readdirSync("../json")) {
  if (file.endsWith(".json")) {
    const sourceFilePath = `../json/${file}`
    const targetFilePath = `./${file.replace(".json", ".toon")}`
    const data = JSON.parse(readFileSync(sourceFilePath, "utf-8"))
    // Note: keyFolding: "safe" breaks round-trip (decoder doesn't unfold dotted keys)
    const toonString = encode(data)

    // Round-trip verification
    try {
      const decoded = decode(toonString)
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

    writeFileSync(targetFilePath, toonString, "utf-8")
    console.log(`✓ ${file}`)
    passed++
  }
}

console.log(`\n${passed} generated, ${failed} failed`)
if (failed > 0) throw new Error("Round-trip verification failed")
