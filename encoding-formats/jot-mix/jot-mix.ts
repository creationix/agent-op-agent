/**
 * Jot-Mix - Jot with Mixed Table Support
 *
 * Extends Jot with inline schema changes for heterogeneous object arrays:
 *   [{a:1,b:2},{a:3},{a:4,b:5}] => 3m[:a,b|1,2|:a|3|:a,b|4,5]
 *
 * Syntax: [:schema|row|row|:newschema|row...]
 *   - Schema rows start with `:`
 *   - Data rows are comma-separated values
 *   - Schema stays active until next `:` row
 *
 * Rules:
 * - `:` prefix marks a schema row
 * - Count guard counts data rows only
 * - Uses `m` marker for mixed tables (vs `r` for uniform)
 */

import { stringify as jotStringify, type StringifyOptions } from "../jot/jot.ts"

const UNSAFE_STRINGS = new Set(["true", "false", "null"])
const UNSAFE_CHARS = [':', ',', '{', '}', '[', ']', '(', ')', '"', '|']

function needsQuoting(str: string): boolean {
  if (str === "") return true
  if (str.trim() !== str) return true
  if (UNSAFE_STRINGS.has(str)) return true
  if (!isNaN(Number(str))) return true
  if (UNSAFE_CHARS.some(c => str.includes(c))) return true
  if ([...str].some(c => c.charCodeAt(0) < 32)) return true
  return false
}

function quoteString(str: string): string {
  return needsQuoting(str) ? JSON.stringify(str) : str
}

function getObjectKeys(obj: object): string[] {
  return Object.keys(obj)
}

function getSchemaKey(obj: Record<string, unknown>): string {
  return getObjectKeys(obj).sort().join(",")
}

// Check if value is a foldable chain: single-key objects nested
function getFoldPath(value: unknown): { path: string[], leaf: unknown } | null {
  const path: string[] = []
  let current = value

  while (
    current !== null &&
    typeof current === "object" &&
    !Array.isArray(current)
  ) {
    const keys = getObjectKeys(current)
    if (keys.length !== 1) break
    path.push(keys[0])
    current = (current as Record<string, unknown>)[keys[0]]
  }

  if (path.length < 2) return null
  return { path, leaf: current }
}

// Check if array is all objects (could be mixed or uniform)
function isObjectArray(arr: unknown[]): boolean {
  return arr.length > 0 && arr.every(item =>
    item !== null && typeof item === "object" && !Array.isArray(item)
  )
}

// Check if array has uniform schema
function getUniformSchema(arr: unknown[]): string[] | null {
  if (!isObjectArray(arr)) return null

  const first = arr[0] as Record<string, unknown>
  const keys = getObjectKeys(first).sort()

  for (const item of arr) {
    const itemKeys = getObjectKeys(item as object).sort()
    if (itemKeys.length !== keys.length) return null
    if (!itemKeys.every((k, i) => k === keys[i])) return null
  }

  return getObjectKeys(first) // preserve original order
}

export interface MixStringifyOptions extends StringifyOptions {
  mixedTables?: boolean  // Enable mixed table format (default: true)
}

let currentOptions: MixStringifyOptions = { guards: true, mixedTables: true }

function stringifyValue(value: unknown): string {
  if (value === null) return "null"
  if (value === true) return "true"
  if (value === false) return "false"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return quoteString(value)

  if (Array.isArray(value)) {
    return stringifyArray(value)
  }

  if (typeof value === "object") {
    return stringifyObject(value as Record<string, unknown>)
  }

  return String(value)
}

function stringifyArray(arr: unknown[]): string {
  const prefix = currentOptions.guards ? `${arr.length}` : ""

  // Check for uniform schema first (use standard table format)
  const uniformSchema = getUniformSchema(arr)
  if (uniformSchema && uniformSchema.length > 0) {
    const rows = arr.map(item => {
      const obj = item as Record<string, unknown>
      return uniformSchema.map(k => stringifyValue(obj[k])).join(",")
    })
    const marker = currentOptions.guards ? "r" : ""
    return `${prefix}${marker}[${uniformSchema.join(",")}|${rows.join("|")}]`
  }

  // Check for mixed object array (use mixed table format)
  if (currentOptions.mixedTables && isObjectArray(arr)) {
    return stringifyMixedTable(arr as Record<string, unknown>[])
  }

  // Regular array
  const marker = currentOptions.guards ? "x" : ""
  const items = arr.map(stringifyValue).join(",")
  return `${prefix}${marker}[${items}]`
}

function stringifyMixedTable(arr: Record<string, unknown>[]): string {
  const parts: string[] = []
  let currentSchema: string | null = null
  let dataRowCount = 0

  for (const obj of arr) {
    const keys = getObjectKeys(obj)
    const schemaKey = getSchemaKey(obj)

    // Emit schema row if schema changed
    if (schemaKey !== currentSchema) {
      parts.push(":" + keys.join(","))
      currentSchema = schemaKey
    }

    // Emit data row
    parts.push(keys.map(k => stringifyValue(obj[k])).join(","))
    dataRowCount++
  }

  const prefix = currentOptions.guards ? `${dataRowCount}` : ""
  const marker = currentOptions.guards ? "m" : ""
  return `${prefix}${marker}[${parts.join("|")}]`
}

function stringifyObject(obj: Record<string, unknown>): string {
  const keys = getObjectKeys(obj)

  // Check for foldable chain
  if (keys.length === 1) {
    const fold = getFoldPath(obj)
    if (fold) {
      return `(${fold.path.join(".")}:${stringifyValue(fold.leaf)})`
    }
  }

  // Regular object
  const pairs = keys.map(k => `${k}:${stringifyValue(obj[k])}`)
  return `{${pairs.join(",")}}`
}

export function stringify(data: unknown, options: MixStringifyOptions = {}): string {
  currentOptions = { guards: true, mixedTables: true, ...options }
  return stringifyValue(data)
}

// ============ TESTS ============
if ((import.meta as { main?: boolean }).main) {
  const tests: [string, unknown, string][] = [
    // Uniform table (same as regular Jot)
    ["uniform table", [{ a: 1, b: 2 }, { a: 3, b: 4 }], "2r[a,b|1,2|3,4]"],

    // Mixed tables - separate schema rows [:schema|row|:schema|row]
    ["mixed 2 schemas",
      [{ a: 1, b: 2 }, { a: 3 }],
      "2m[:a,b|1,2|:a|3]"],

    ["mixed 3 schemas",
      [{ a: 1 }, { a: 2, b: 3 }, { c: 4 }],
      "3m[:a|1|:a,b|2,3|:c|4]"],

    ["mixed with runs",
      [{ a: 1 }, { a: 2 }, { b: 3 }, { b: 4 }],
      "4m[:a|1|2|:b|3|4]"],

    // Complex values in mixed tables
    ["mixed with nested",
      [{ type: "path", value: { suf: ".php" } }, { type: "status", code: 404 }],
      "2m[:type,value|path,{suf:.php}|:type,code|status,404]"],
  ]

  let passed = 0
  let failed = 0

  console.log("=== Mixed Table Tests ===")
  for (const [name, input, expected] of tests) {
    const result = stringify(input)
    if (result === expected) {
      console.log(`✓ ${name}`)
      passed++
    } else {
      console.log(`✗ ${name}`)
      console.log(`  input:    ${JSON.stringify(input)}`)
      console.log(`  expected: ${expected}`)
      console.log(`  got:      ${result}`)
      failed++
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
}
