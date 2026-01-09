/**
 * Jot - JSON Optimized for Tokens
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
 * 4. Tables - object arrays with schema rows
 *    [{a:1},{a:2}] => 2m[:a|1|2]
 *    [{a:1},{b:2}] => 2m[:a|1|:b|2]
 *    Schema rows start with `:`, active until next `:` row
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

  // Need at least 1 level to fold
  if (path.length < 1) return null
  return { path, leaf: current }
}

// Check if array is all objects
function isObjectArray(arr: unknown[]): boolean {
  return arr.length > 0 && arr.every(item =>
    item !== null && typeof item === "object" && !Array.isArray(item)
  )
}

function getSchemaKey(obj: Record<string, unknown>): string {
  return getObjectKeys(obj).sort().join(",")
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
  guards?: boolean  // Include Nx/Nm count prefixes (default: true)
  pretty?: boolean  // Pretty print with newlines and indentation (default: false)
  indent?: string   // Indentation string (default: "  ")
}

let currentOptions: StringifyOptions = { guards: true, pretty: false, indent: "  " }
let depth = 0

function ind(): string {
  return currentOptions.pretty ? currentOptions.indent!.repeat(depth) : ""
}

function nl(): string {
  return currentOptions.pretty ? "\n" : ""
}

// Check if array contains any complex values (objects or arrays)
function hasComplexItems(arr: unknown[]): boolean {
  return arr.some(item => item !== null && typeof item === "object")
}

// Check if object array has any schema reuse (worth using table format)
function hasSchemaReuse(arr: Record<string, unknown>[]): boolean {
  if (arr.length < 2) return false
  const schemas = new Set<string>()
  for (const obj of arr) {
    const schema = getSchemaKey(obj)
    if (schemas.has(schema)) return true
    schemas.add(schema)
  }
  return false
}

function stringifyArray(arr: unknown[]): string {
  // Object arrays with schema reuse use table format
  if (isObjectArray(arr) && hasSchemaReuse(arr as Record<string, unknown>[])) {
    return stringifyTable(arr as Record<string, unknown>[])
  }

  // Single-item arrays: no guard prefix, no extra indentation
  if (arr.length === 1) {
    const item = stringifyValue(arr[0])
    return `[${item}]`
  }

  // Regular array: Nx[items] or [items]
  const prefix = currentOptions.guards ? `${arr.length}` : ""
  const marker = currentOptions.guards ? "x" : ""
  if (currentOptions.pretty && arr.length > 0 && hasComplexItems(arr)) {
    // Complex arrays: split across lines
    depth++
    const items = arr.map(v => ind() + stringifyValue(v)).join("," + nl())
    depth--
    return `${prefix}${marker}[${nl()}${items}${nl()}${ind()}]`
  }
  // Simple arrays: keep on one line, add spaces in pretty mode
  const sep = currentOptions.pretty ? ", " : ","
  const items = arr.map(stringifyValue).join(sep)
  return currentOptions.pretty ? `${prefix}${marker}[ ${items} ]` : `${prefix}${marker}[${items}]`
}

function stringifyTable(arr: Record<string, unknown>[]): string {
  const parts: string[] = []
  let currentSchema: string | null = null
  let dataRowCount = 0

  for (const obj of arr) {
    const keys = getObjectKeys(obj)
    const schemaKey = getSchemaKey(obj)

    // Emit schema row if schema changed
    if (schemaKey !== currentSchema) {
      const sep = currentOptions.pretty ? ", " : ","
      parts.push(":" + keys.join(sep))
      currentSchema = schemaKey
    }

    // Emit data row (increment depth for nested structures)
    const sep = currentOptions.pretty ? ", " : ","
    if (currentOptions.pretty) depth++
    parts.push(keys.map(k => stringifyValue(obj[k])).join(sep))
    if (currentOptions.pretty) depth--
    dataRowCount++
  }

  const prefix = currentOptions.guards ? `${dataRowCount}` : ""
  const marker = currentOptions.guards ? "m" : ""
  if (currentOptions.pretty) {
    // Schema rows indent one char less than data rows
    depth++
    const dataInd = ind()
    const schemaInd = dataInd.slice(1)  // One char less
    const rows = parts.map(p => (p.startsWith(":") ? schemaInd + p : dataInd + p)).join("\n")
    depth--
    return `${prefix}${marker}[\n${rows}\n${ind()}]`
  }
  return `${prefix}${marker}[${parts.join("|")}]`
}

function stringifyObject(obj: Record<string, unknown>): string {
  const keys = getObjectKeys(obj)

  // Check for foldable chain at root - entire object is a single path (need 2+ levels)
  if (keys.length === 1) {
    const fold = getFoldPath(obj)
    if (fold && fold.path.length >= 2) {
      return `(${fold.path.join(".")}:${stringifyValue(fold.leaf)})`
    }
  }

  // Helper to stringify a key-value pair with folding
  const stringifyPair = (k: string, forPretty: boolean): string => {
    const val = obj[k]
    // Try to fold key + value chain (e.g., server:{host:x} → server.host:x)
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const fold = getFoldPath(val)
      if (fold) {
        const foldedKey = `${k}.${fold.path.join(".")}`
        if (forPretty) {
          return `${foldedKey}: ${stringifyValue(fold.leaf)}`
        }
        return `${foldedKey}:${stringifyValue(fold.leaf)}`
      }
    }
    if (forPretty) {
      return `${k}: ${stringifyValue(val)}`
    }
    return `${k}:${stringifyValue(val)}`
  }

  // Regular object
  if (currentOptions.pretty && keys.length > 1) {
    depth++
    const pairs = keys.map(k => ind() + stringifyPair(k, true)).join(",\n")
    depth--
    return `{\n${pairs}\n${ind()}}`
  }
  // Single-key objects stay inline even in pretty mode
  if (currentOptions.pretty && keys.length === 1) {
    const pairs = keys.map(k => stringifyPair(k, true))
    return `{ ${pairs.join(", ")} }`
  }
  const pairs = keys.map(k => stringifyPair(k, false))
  return `{${pairs.join(",")}}`
}

export function stringify(data: unknown, options: StringifyOptions = {}): string {
  currentOptions = { guards: true, pretty: false, indent: "  ", ...options }
  depth = 0
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
    ["fold 1 level", { a: { b: 1 } }, "(a.b:1)"],
    ["fold 2 levels", { a: { b: { c: 1 } } }, "(a.b.c:1)"],
    ["no fold primitive", { a: 1 }, "{a:1}"],
    ["fold in multi-key", { a: { b: 1 }, c: { d: 2 } }, "{a.b:1,c.d:2}"],
    ["no fold multi-key value", { a: { b: 1, c: 2 } }, "{a:{b:1,c:2}}"],

    // Tables (object arrays with schema reuse)
    ["uniform table", [{ a: 1, b: 2 }, { a: 3, b: 4 }], "2m[:a,b|1,2|3,4]"],
    ["3-row table", [{ x: 1 }, { x: 2 }, { x: 3 }], "3m[:x|1|2|3]"],
    ["schema runs", [{ a: 1 }, { a: 2 }, { b: 3 }, { b: 4 }], "4m[:a|1|2|:b|3|4]"],

    // Object arrays without schema reuse (no table format)
    ["single obj array", [{ a: 1 }], "[{a:1}]"],
    ["no schema reuse", [{ a: 1 }, { b: 2 }], "2x[{a:1},{b:2}]"],

    // Single-item arrays (no guard prefix)
    ["single item", [42], "[42]"],
    ["single string", ["hello"], "[hello]"],

    // Nested
    ["nested", { users: [{ id: 1, name: "Alice" }] }, "{users:[{id:1,name:Alice}]}"],
  ]

  // Tests with guards: false
  const noGuardTests: [string, unknown, string][] = [
    ["array no guard", [1, 2, 3], "[1,2,3]"],
    ["table no guard", [{ a: 1 }, { a: 2 }], "[:a|1|2]"],
    ["nested no guard", { items: [1, 2] }, "{items:[1,2]}"],
  ]

  // Tests with pretty: true
  const prettyTests: [string, unknown, string][] = [
    ["pretty object", { a: 1, b: 2 }, "{\n  a: 1,\n  b: 2\n}"],
    ["pretty array inline", [1, 2, 3], "3x[ 1, 2, 3 ]"],
    ["pretty table", [{ x: 1 }, { x: 2 }], "2m[\n :x\n  1\n  2\n]"],
    ["pretty fold", { a: { b: 1 }, c: { d: 2 } }, "{\n  a.b: 1,\n  c.d: 2\n}"],
    ["pretty array value", { items: [1, 2] }, "{ items: 2x[ 1, 2 ] }"],
    ["pretty table value", { labels: [{ name: "bug" }, { name: "fix" }] }, "{ labels: 2m[\n :name\n  bug\n  fix\n] }"],
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

  console.log("\n=== Pretty print ===")
  for (const [name, input, expected] of prettyTests) {
    const result = stringify(input, { pretty: true })
    if (result === expected) {
      console.log(`✓ ${name}`)
      passed++
    } else {
      console.log(`✗ ${name}`)
      console.log(`  input:    ${JSON.stringify(input)}`)
      console.log(`  expected: ${JSON.stringify(expected)}`)
      console.log(`  got:      ${JSON.stringify(result)}`)
      failed++
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
}
