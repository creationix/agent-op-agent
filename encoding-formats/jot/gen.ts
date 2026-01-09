#!/usr/bin/env bun
// Generate samples by reading from ../json/*.json and writing the equivalent here.
// Uses compact mode (no guards) - see jot-safe for guarded version
import { stringify } from "./jot.ts"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

// Iterate over files in "../json/*.json"
for (const file of readdirSync("../json")) {
  if (file.endsWith(".json")) {
    const sourceFilePath = `../json/${file}`
    const targetFilePath = `./${file.replace(".json", ".jot")}`
    const data = JSON.parse(readFileSync(sourceFilePath, "utf-8"))
    const encodedString = stringify(data, { guards: false })
    writeFileSync(targetFilePath, encodedString, "utf-8")
    console.log(`Generated ${targetFilePath} from ${sourceFilePath}`)
  }
}
