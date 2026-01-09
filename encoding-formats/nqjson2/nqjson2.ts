/**
 * NQJSON2 - Token-efficient JSON encoding for LLMs
 *
 * Features:
 * 1. Minimal quoting - only quote strings when necessary
 *    {name:Alice,age:30,city:New York}
 *
 * 2. Key folding - collapse single-property object chains
 *    {a:{b:{c:1}}} => (a.b.c:1)
 *
 * 3. Array guards - prefix with element count
 *    [1,2,3] => 3x[1,2,3]
 *
 * 4. Tables - uniform object arrays with row count
 *    [{a:1,b:2},{a:3,b:4}] => 2r[a,b|1,2|3,4]
 *
 * Quoting rules - quote string values only if:
 *   - Parses as a number ("123", "1.0" - not "api5", "v2")
 *   - Contains unsafe chars: : , { } [ ] ( ) " |
 *   - Equals true, false, or null
 *   - Has leading/trailing whitespace or is empty
 *   - Contains control characters (codepoint < 32)
 */

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

  // Need at least 2 levels to fold
  if (path.length < 2) return null
  return { path, leaf: current }
}

// Check if array is uniform (all objects with same keys)
function getUniformSchema(arr: unknown[]): string[] | null {
  if (arr.length === 0) return null
  if (!arr.every(item => item !== null && typeof item === "object" && !Array.isArray(item))) {
    return null
  }

  const first = arr[0] as Record<string, unknown>
  const keys = getObjectKeys(first).sort()

  for (const item of arr) {
    const itemKeys = getObjectKeys(item as object).sort()
    if (itemKeys.length !== keys.length) return null
    if (!itemKeys.every((k, i) => k === keys[i])) return null
  }

  return getObjectKeys(first) // preserve original order
}

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

// Options for stringify
export interface StringifyOptions {
  guards?: boolean  // Include Nx/Nr count prefixes (default: true)
}

let currentOptions: StringifyOptions = { guards: true }

function stringifyArray(arr: unknown[]): string {
  const prefix = currentOptions.guards ? `${arr.length}` : ""

  // Check for uniform schema (table)
  const schema = getUniformSchema(arr)
  if (schema && schema.length > 0) {
    // Table format: Nr[schema|row|row|...] or [schema|row|row|...]
    const rows = arr.map(item => {
      const obj = item as Record<string, unknown>
      return schema.map(k => stringifyValue(obj[k])).join(",")
    })
    const marker = currentOptions.guards ? "r" : ""
    return `${prefix}${marker}[${schema.join(",")}|${rows.join("|")}]`
  }

  // Regular array: Nx[items] or [items]
  const marker = currentOptions.guards ? "x" : ""
  const items = arr.map(stringifyValue).join(",")
  return `${prefix}${marker}[${items}]`
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

export function stringify(data: unknown, options: StringifyOptions = {}): string {
  currentOptions = { guards: true, ...options }
  return stringifyValue(data)
}

// ============ TESTS ============
// Run with: bun nqjson2.ts
if ((import.meta as { main?: boolean }).main) {
  const tests: [string, unknown, string][] = [
    // Basic values
    ["null", null, "null"],
    ["true", true, "true"],
    ["false", false, "false"],
    ["number", 42, "42"],
    ["float", 3.14, "3.14"],

    // Strings - unquoted
    ["simple string", "hello", "hello"],
    ["string with space", "hello world", "hello world"],
    ["identifier", "api5", "api5"],

    // Strings - quoted
    ["empty string", "", '""'],
    ["numeric string", "123", '"123"'],
    ["float string", "1.0", '"1.0"'],
    ["reserved true", "true", '"true"'],
    ["reserved false", "false", '"false"'],
    ["reserved null", "null", '"null"'],
    ["contains colon", "a:b", '"a:b"'],
    ["contains comma", "a,b", '"a,b"'],
    ["contains pipe", "a|b", '"a|b"'],
    ["leading space", " hi", '" hi"'],
    ["trailing space", "hi ", '"hi "'],

    // Arrays
    ["empty array", [], "0x[]"],
    ["simple array", [1, 2, 3], "3x[1,2,3]"],
    ["string array", ["a", "b"], '2x[a,b]'],

    // Objects
    ["empty object", {}, "{}"],
    ["simple object", { name: "Alice", age: 30 }, "{name:Alice,age:30}"],

    // Key folding
    ["fold 2 levels", { a: { b: 1 } }, "(a.b:1)"],
    ["fold 3 levels", { a: { b: { c: 1 } } }, "(a.b.c:1)"],
    ["no fold single", { a: 1 }, "{a:1}"],
    ["no fold multi-key", { a: { b: 1, c: 2 } }, "{a:{b:1,c:2}}"],

    // Tables
    ["uniform array", [{ a: 1, b: 2 }, { a: 3, b: 4 }], "2r[a,b|1,2|3,4]"],
    ["3-row table", [{ x: 1 }, { x: 2 }, { x: 3 }], "3r[x|1|2|3]"],

    // Mixed
    ["nested", { users: [{ id: 1, name: "Alice" }] }, "{users:1r[id,name|1,Alice]}"],
  ]

  // Tests with guards: false
  const noGuardTests: [string, unknown, string][] = [
    ["array no guard", [1, 2, 3], "[1,2,3]"],
    ["table no guard", [{ a: 1 }, { a: 2 }], "[a|1|2]"],
    ["nested no guard", { items: [1, 2] }, "{items:[1,2]}"],
  ]

  let passed = 0
  let failed = 0

  console.log("=== With guards (default) ===")
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

  console.log("\n=== Without guards ===")
  for (const [name, input, expected] of noGuardTests) {
    const result = stringify(input, { guards: false })
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
