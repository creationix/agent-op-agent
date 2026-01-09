#!/usr/bin/env bun
// Generate samples by reading from ../json/*.json and writing the equivalent here.
// Uses guarded mode (Nx/Nr prefixes) - see nqjson2 for compact version
import { stringify } from "../nqjson2/nqjson2.ts"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

// Iterate over files in "../json/*.json"
for (const file of readdirSync("../json")) {
  if (file.endsWith(".json")) {
    const sourceFilePath = `../json/${file}`
    const targetFilePath = `./${file.replace(".json", ".nqjson")}`
    const data = JSON.parse(readFileSync(sourceFilePath, "utf-8"))
    const encodedString = stringify(data, { guards: true })
    writeFileSync(targetFilePath, encodedString, "utf-8")
    console.log(`Generated ${targetFilePath} from ${sourceFilePath}`)
  }
}
