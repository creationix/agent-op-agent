#!/usr/bin/env bun
// Generate samples using Jot with mixed table support
import { stringify } from "./jot-mix.ts"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

for (const file of readdirSync("../json")) {
  if (file.endsWith(".json")) {
    const sourceFilePath = `../json/${file}`
    const targetFilePath = `./${file.replace(".json", ".jotm")}`
    const data = JSON.parse(readFileSync(sourceFilePath, "utf-8"))
    const encodedString = stringify(data, { guards: true, mixedTables: true })
    writeFileSync(targetFilePath, encodedString, "utf-8")
    console.log(`Generated ${targetFilePath} from ${sourceFilePath}`)
  }
}
