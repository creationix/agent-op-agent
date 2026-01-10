#!/usr/bin/env bun
// Unified generator for all encoding formats
// Usage: bun gen.ts

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"

// Import format encoders
import { stringify as jotStringify, parse as jotParse } from "./jot/jot.ts"
import { stringify as jsonitoStringify, parse as jsonitoParse } from "./jsonito/jsonito.ts"
import { encode as d2Encode, decode as d2Decode } from "./d2/d2.ts"
import { encode as toonEncode, decode as toonDecode } from "@toon-format/toon"
import { stringify as yamlStringify, parse as yamlParse } from "yaml"
import { stringify as tomlStringify, parse as tomlParse } from "smol-toml"
import { format as smartJsonFormat } from "./json/smart-json.ts"

const ROOT = dirname(import.meta.path)
const JSON_DIR = join(ROOT, "json")

// Get source JSON files (exclude .smart.json)
function getSourceFiles(): string[] {
  return readdirSync(JSON_DIR).filter(
    (f) => f.endsWith(".json") && !f.includes(".smart.")
  )
}

// Deep equality for TOML (doesn't preserve key order)
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object)
    const bKeys = Object.keys(b as object)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every(
      (k) =>
        deepEqual(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k]
        )
    )
  }
  return false
}

type FormatConfig = {
  name: string
  dir: string
  ext: string
  encode: (data: unknown) => string
  decode: (str: string) => unknown
  compare?: (a: unknown, b: unknown) => boolean // custom comparison
  extraFiles?: (data: unknown, baseName: string) => { name: string; content: string }[]
  skipRoundTrip?: boolean
}

const formats: FormatConfig[] = [
  {
    name: "Jot",
    dir: "jot",
    ext: "jot",
    encode: jotStringify,
    decode: jotParse,
    extraFiles: (data, baseName) => [
      { name: `${baseName}.pretty.jot`, content: jotStringify(data, { pretty: true }) },
    ],
  },
  {
    name: "JSONito",
    dir: "jsonito",
    ext: "jito",
    encode: jsonitoStringify,
    decode: jsonitoParse,
  },
  {
    name: "D2",
    dir: "d2",
    ext: "d2",
    encode: d2Encode,
    decode: d2Decode,
  },
  {
    name: "TOON",
    dir: "toon",
    ext: "toon",
    encode: toonEncode,
    decode: toonDecode,
  },
  {
    name: "YAML",
    dir: "yaml",
    ext: "yaml",
    encode: yamlStringify,
    decode: yamlParse,
  },
  {
    name: "TOML",
    dir: "toml",
    ext: "toml",
    encode: tomlStringify,
    decode: tomlParse,
    compare: deepEqual,
  },
  {
    name: "Smart JSON",
    dir: "json",
    ext: "smart.json",
    encode: smartJsonFormat,
    decode: JSON.parse,
    skipRoundTrip: true, // It's just reformatted JSON, no need to verify
  },
]

async function main() {
  const files = getSourceFiles()
  console.log(`Found ${files.length} source files\n`)

  for (const format of formats) {
    console.log(`=== ${format.name} ===`)
    let passed = 0
    let failed = 0

    for (const file of files) {
      const sourcePath = join(JSON_DIR, file)
      const baseName = file.replace(".json", "")
      const targetPath = join(ROOT, format.dir, `${baseName}.${format.ext}`)

      try {
        const data = JSON.parse(readFileSync(sourcePath, "utf-8"))
        let encoded: string

        try {
          encoded = format.encode(data)
        } catch (e) {
          console.log(`  ⊘ ${file}: encode failed - ${(e as Error).message.split("\n")[0]}`)
          continue
        }

        // Round-trip verification
        if (!format.skipRoundTrip) {
          try {
            const decoded = format.decode(encoded)
            const compare = format.compare || ((a, b) => JSON.stringify(a) === JSON.stringify(b))
            if (!compare(decoded, data)) {
              console.log(`  ⊘ ${file}: round-trip mismatch`)
              // Still write the file for formats like TOML that have limitations
              writeFileSync(targetPath, encoded, "utf-8")
              passed++
              continue
            }
          } catch (e) {
            console.error(`  ✗ ${file}: parse error - ${(e as Error).message}`)
            failed++
            continue
          }
        }

        writeFileSync(targetPath, encoded, "utf-8")

        // Generate extra files (e.g., pretty-printed versions)
        if (format.extraFiles) {
          for (const extra of format.extraFiles(data, baseName)) {
            const extraPath = join(ROOT, format.dir, extra.name)
            writeFileSync(extraPath, extra.content, "utf-8")
          }
        }

        passed++
      } catch (e) {
        console.error(`  ✗ ${file}: ${(e as Error).message}`)
        failed++
      }
    }

    console.log(`  ${passed} generated, ${failed} failed\n`)
  }
}

main()
