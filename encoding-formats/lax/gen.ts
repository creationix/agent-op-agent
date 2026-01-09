#!/usr/bin/env bun
// Generate samples by reading from ../json/*.json and writing the equivalent here.
import { stringify } from "./lax.ts"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

// Iterate over files in "../json/*.json"
for (const file of readdirSync("../json")) {
  if (file.endsWith(".json")) {
    const sourceFilePath = `../json/${file}`
    const targetFilePath = `./${file.replace(".json", ".lax")}`
    const data = JSON.parse(readFileSync(sourceFilePath, "utf-8"))
    const encodedString = stringify(data)
    writeFileSync(targetFilePath, encodedString, "utf-8")
    console.log(`Generated ${targetFilePath} from ${sourceFilePath}`)
  }
}
