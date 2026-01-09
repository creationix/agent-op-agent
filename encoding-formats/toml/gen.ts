#!/usr/bin/env bun
// Generate samples by reading from ../json/*.json and writing the equivalent here.
import { stringify } from "smol-toml"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

// Iterate over files in "../json/*.json"
for (const file of readdirSync("../json")) {
  if (file.endsWith(".json")) {
    const sourceFilePath = `../json/${file}`
    const targetFilePath = `./${file.replace(".json", ".toml")}`
    const data = JSON.parse(readFileSync(sourceFilePath, "utf-8"))
    const tomlString = stringify(data)
    writeFileSync(targetFilePath, tomlString, "utf-8")
    console.log(`Generated ${targetFilePath} from ${sourceFilePath}`)
  }
}
