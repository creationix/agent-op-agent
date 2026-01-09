#!/usr/bin/env bun
// Generate samples by reading from ../json/*.json and writing the equivalent here.
// Uses bun runtime
import { stringify } from "./jsonito.ts"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

// Iterate over files in "../json/*.json"
for (const file of readdirSync("../json")) {
    if (file.endsWith(".json")) {
        const sourceFilePath = `../json/${file}`
        const targetFilePath = `./${file.replace(".json", ".jito")}`
        const data = JSON.parse(readFileSync(sourceFilePath, "utf-8"))
        const jsonitoString = stringify(data)
        writeFileSync(targetFilePath, jsonitoString, "utf-8")
        console.log(`Generated ${targetFilePath} from ${sourceFilePath}`)
    }
}
