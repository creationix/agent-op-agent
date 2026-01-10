/**
 * Jot - JSON Optimized for Tokens
 *
 * Features:
 * 1. Minimal quoting - only quote strings when necessary
 *    {name:Alice,age:30,city:New York}
 *
 * 2. Key folding - collapse single-property object chains with dots
 *    {a:{b:{c:1}}} => {a.b.c:1}
 *    Use quoted keys for literal dots: {"a.b":1}
 *
 * 3. Tables - object arrays with schema rows
 *    [{a:1},{a:2}] => [:a|1|2]
 *    [{a:1},{b:2}] => [:a|1|:b|2]
 *    Schema rows start with `:`, active until next `:` row
 *
 * Quoting rules - quote string values only if:
 *   - Parses as a number ("123", "1.0" - not "api5", "v2")
 *   - Contains unsafe chars: : , { } [ ] " |
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
  pretty?: boolean  // Pretty print with newlines and indentation (default: false)
  indent?: string   // Indentation string (default: "  ")
}

let currentOptions: StringifyOptions = { pretty: false, indent: "  " }
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

  // Regular array
  if (currentOptions.pretty && arr.length > 0 && hasComplexItems(arr)) {
    // Complex arrays: items on separate lines, closing bracket on last line
    depth++
    const items: string[] = []
    for (let i = 0; i < arr.length; i++) {
      const v = stringifyValue(arr[i])
      if (i === arr.length - 1) {
        items.push(`${ind()}${v} ]`)
      } else {
        items.push(`${ind()}${v}`)
      }
    }
    depth--
    return `[\n${items.join(",\n")}`
  }
  // Simple arrays: keep on one line, add spaces in pretty mode
  const sep = currentOptions.pretty ? ", " : ","
  const items = arr.map(stringifyValue).join(sep)
  return currentOptions.pretty ? `[ ${items} ]` : `[${items}]`
}

function stringifyTable(arr: Record<string, unknown>[]): string {
  const parts: string[] = []
  let currentSchema: string | null = null

  for (const obj of arr) {
    const keys = getObjectKeys(obj)
    const schemaKey = getSchemaKey(obj)

    // Emit schema row if schema changed
    if (schemaKey !== currentSchema) {
      const sep = currentOptions.pretty ? ", " : ","
      parts.push(keys.join(sep))
      currentSchema = schemaKey
    }

    // Emit data row (increment depth for nested structures)
    const sep = currentOptions.pretty ? ", " : ","
    if (currentOptions.pretty) depth++
    parts.push(keys.map(k => stringifyValue(obj[k])).join(sep))
    if (currentOptions.pretty) depth--
  }

  if (currentOptions.pretty) {
    // Schema rows indent one char less than data rows
    depth++
    const dataInd = ind()
    const schemaInd = dataInd.slice(1)  // One char less
    // First row is schema, rest alternate between schema and data
    const rows = parts.map((p, i) => (i === 0 ? schemaInd + p : dataInd + p)).join("\n")
    depth--
    return `(\n${rows}\n${ind()})`
  }
  return `(${parts.join("|")})`
}

function stringifyObject(obj: Record<string, unknown>): string {
  const keys = getObjectKeys(obj)

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
    // Multi-key objects: first key on same line as brace, closing brace on last line
    depth++
    const pairs: string[] = []
    for (let i = 0; i < keys.length; i++) {
      const p = stringifyPair(keys[i], true)
      if (i === 0) {
        pairs.push(p)
      } else if (i === keys.length - 1) {
        pairs.push(`${ind()}${p} }`)
      } else {
        pairs.push(`${ind()}${p}`)
      }
    }
    depth--
    return `{ ${pairs.join(",\n")}`
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
  currentOptions = { pretty: false, indent: "  ", ...options }
  depth = 0
  return stringifyValue(data)
}

// ============ PARSER ============

class JotParser {
  private pos = 0
  constructor(private input: string) {}

  parse(): unknown {
    this.skipWhitespace()
    const result = this.parseValue("") // empty terminators = read to end for top-level atoms
    this.skipWhitespace()
    if (this.pos < this.input.length) {
      throw new Error(`Unexpected character at position ${this.pos}: '${this.input[this.pos]}'`)
    }
    return result
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++
    }
  }

  private peek(): string {
    return this.input[this.pos] || ""
  }

  // Parse a value with specified terminators for unquoted strings
  // terminators: characters that end an unquoted string value
  private parseValue(terminators = ""): unknown {
    this.skipWhitespace()
    const ch = this.peek()

    if (ch === "{") return this.parseObject()
    if (ch === "[") return this.parseArray()
    if (ch === "(") return this.parseTable()
    if (ch === '"') return this.parseQuotedString()

    // Unquoted value - read until terminator
    return this.parseAtom(terminators)
  }

  private parseQuotedString(): string {
    if (this.peek() !== '"') {
      throw new Error(`Expected '"' at position ${this.pos}`)
    }
    this.pos++ // skip opening quote

    let result = ""
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (ch === '"') {
        this.pos++ // skip closing quote
        return result
      }
      if (ch === "\\") {
        this.pos++
        if (this.pos >= this.input.length) {
          throw new Error("Unexpected end of input in string escape")
        }
        const escaped = this.input[this.pos]
        switch (escaped) {
          case '"': result += '"'; break
          case "\\": result += "\\"; break
          case "/": result += "/"; break
          case "b": result += "\b"; break
          case "f": result += "\f"; break
          case "n": result += "\n"; break
          case "r": result += "\r"; break
          case "t": result += "\t"; break
          case "u": {
            if (this.pos + 4 >= this.input.length) {
              throw new Error("Invalid unicode escape")
            }
            const hex = this.input.slice(this.pos + 1, this.pos + 5)
            result += String.fromCharCode(parseInt(hex, 16))
            this.pos += 4
            break
          }
          default:
            throw new Error(`Invalid escape sequence '\\${escaped}'`)
        }
      } else {
        result += ch
      }
      this.pos++
    }
    throw new Error("Unterminated string")
  }

  // Parse unquoted atom - reads until terminator characters
  // Empty terminators = read to end of input (for top-level values)
  private parseAtom(terminators: string): unknown {
    const start = this.pos

    if (terminators === "") {
      // Top level: read everything remaining as the value
      const token = this.input.slice(start).trim()
      this.pos = this.input.length

      if (token === "") {
        throw new Error(`Unexpected end of input at position ${start}`)
      }

      // Keywords
      if (token === "null") return null
      if (token === "true") return true
      if (token === "false") return false

      // Try number
      const num = Number(token)
      if (!isNaN(num)) return num

      return token
    }

    // Read until terminator character
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (terminators.includes(ch)) break
      this.pos++
    }

    const token = this.input.slice(start, this.pos).trim()
    if (token === "") {
      throw new Error(`Unexpected character at position ${this.pos}: '${this.peek()}'`)
    }

    // Keywords
    if (token === "null") return null
    if (token === "true") return true
    if (token === "false") return false

    // Try number
    const num = Number(token)
    if (!isNaN(num) && token !== "") return num

    // Otherwise it's an unquoted string
    return token
  }

  // Parse value that may include unquoted strings with spaces
  // Used in table cells and array items where context determines boundaries
  private parseTableValue(terminators: string): unknown {
    this.skipWhitespace()
    const ch = this.peek()

    if (ch === '"') return this.parseQuotedString()
    if (ch === "{") return this.parseObject()
    if (ch === "[") return this.parseArray()
    if (ch === "(") return this.parseTable()

    // Read until terminator
    const start = this.pos
    while (this.pos < this.input.length) {
      const c = this.input[this.pos]
      if (terminators.includes(c)) break
      this.pos++
    }

    let token = this.input.slice(start, this.pos).trim()
    if (token === "") return null // empty cell

    // Keywords
    if (token === "null") return null
    if (token === "true") return true
    if (token === "false") return false

    // Try number
    const num = Number(token)
    if (!isNaN(num)) return num

    return token
  }

  // Parse array: [item, item, ...]
  private parseArray(): unknown[] {
    if (this.peek() !== "[") {
      throw new Error(`Expected '[' at position ${this.pos}`)
    }
    this.pos++ // skip [

    const result: unknown[] = []
    this.skipWhitespace()

    while (this.peek() !== "]") {
      if (this.pos >= this.input.length) {
        throw new Error("Unterminated array")
      }
      result.push(this.parseValue(",])")) // array values end at comma, ], or )
      this.skipWhitespace()
      if (this.peek() === ",") {
        this.pos++ // skip comma
        this.skipWhitespace()
      }
    }

    this.pos++ // skip ]
    return result
  }

  // Parse table: (schema|row|row|...)
  // First row is schema, all following rows are data (no schema changes with () syntax)
  private parseTable(): unknown[] {
    if (this.peek() !== "(") {
      throw new Error(`Expected '(' at position ${this.pos}`)
    }
    this.pos++ // skip (

    const result: Record<string, unknown>[] = []
    this.skipWhitespace()

    // First row is always schema
    const schema = this.parseSchemaRow()
    this.skipWhitespace()
    if (this.peek() === "|") {
      this.pos++
      this.skipWhitespace()
    }

    // Remaining rows are data
    while (this.peek() !== ")") {
      if (this.pos >= this.input.length) {
        throw new Error("Unterminated table")
      }

      const values = this.parseDataRow(schema.length)
      const obj: Record<string, unknown> = {}
      for (let i = 0; i < schema.length; i++) {
        obj[schema[i]] = values[i] ?? null
      }
      result.push(obj)

      this.skipWhitespace()
      if (this.peek() === "|") {
        this.pos++
        this.skipWhitespace()
      }
    }

    this.pos++ // skip )
    return result
  }

  private parseSchemaRow(): string[] {
    const cols: string[] = []
    let col = ""

    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (ch === "|" || ch === ")" || ch === "]" || ch === "\n") {
        if (col.trim()) cols.push(col.trim())
        break
      }
      if (ch === ",") {
        if (col.trim()) cols.push(col.trim())
        col = ""
        this.pos++
        continue
      }
      col += ch
      this.pos++
    }

    return cols
  }

  private parseDataRow(colCount: number): unknown[] {
    const values: unknown[] = []

    for (let i = 0; i < colCount; i++) {
      this.skipWhitespace()
      const terminators = i < colCount - 1 ? ",|)]\n" : "|)]\n"
      const value = this.parseTableValue(terminators)
      values.push(value)
      this.skipWhitespace()
      if (this.peek() === ",") {
        this.pos++
      }
    }

    return values
  }

  // Parse regular object: {key:value,...}
  private parseObject(): Record<string, unknown> {
    if (this.peek() !== "{") {
      throw new Error(`Expected '{' at position ${this.pos}`)
    }
    this.pos++ // skip {

    const result: Record<string, unknown> = {}
    this.skipWhitespace()

    while (this.peek() !== "}") {
      if (this.pos >= this.input.length) {
        throw new Error("Unterminated object")
      }

      const { key: keyPath, quoted } = this.parseKey()
      this.skipWhitespace()

      if (this.peek() !== ":") {
        throw new Error(`Expected ':' after key '${keyPath}' at position ${this.pos}`)
      }
      this.pos++ // skip :

      const value = this.parseValue(",}") // object values end at comma or }

      // Quoted keys are literal (no unfolding), unquoted keys unfold dots
      if (quoted) {
        result[keyPath] = value
      } else {
        const unfolded = this.unfoldKey(keyPath, value)
        this.mergeObjects(result, unfolded)
      }

      this.skipWhitespace()
      if (this.peek() === ",") {
        this.pos++ // skip comma
        this.skipWhitespace()
      }
    }

    this.pos++ // skip }
    return result
  }

  // Parse key which may be dotted (a.b.c) or quoted ("a.b")
  // Returns { key, quoted } where quoted=true means don't unfold dots
  private parseKey(): { key: string; quoted: boolean } {
    this.skipWhitespace()

    // Handle quoted keys (preserves literal dots)
    if (this.peek() === '"') {
      return { key: this.parseQuotedString(), quoted: true }
    }

    const start = this.pos
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      // Keys can contain dots, stop at : or structural chars
      if (/[:\,{}\[\]|]/.test(ch) || /\s/.test(ch)) break
      this.pos++
    }
    const key = this.input.slice(start, this.pos)
    if (key === "") {
      throw new Error(`Expected key at position ${this.pos}`)
    }
    return { key, quoted: false }
  }

  // Convert dotted key to nested object: "a.b.c" + value → {a:{b:{c:value}}}
  private unfoldKey(keyPath: string, value: unknown): Record<string, unknown> {
    const parts = keyPath.split(".")
    let result: Record<string, unknown> = {}
    let current = result

    for (let i = 0; i < parts.length - 1; i++) {
      const nested: Record<string, unknown> = {}
      current[parts[i]] = nested
      current = nested
    }
    current[parts[parts.length - 1]] = value

    return result
  }

  // Deep merge src into target
  private mergeObjects(target: Record<string, unknown>, src: Record<string, unknown>): void {
    for (const key of Object.keys(src)) {
      if (
        key in target &&
        typeof target[key] === "object" &&
        target[key] !== null &&
        !Array.isArray(target[key]) &&
        typeof src[key] === "object" &&
        src[key] !== null &&
        !Array.isArray(src[key])
      ) {
        this.mergeObjects(
          target[key] as Record<string, unknown>,
          src[key] as Record<string, unknown>
        )
      } else {
        target[key] = src[key]
      }
    }
  }
}

export function parse(input: string): unknown {
  return new JotParser(input).parse()
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
    ["empty array", [], "[]"],
    ["simple array", [1, 2, 3], "[1,2,3]"],
    ["string array", ["a", "b"], '[a,b]'],

    // Objects
    ["empty object", {}, "{}"],
    ["simple object", { name: "Alice", age: 30 }, "{name:Alice,age:30}"],

    // Key folding
    ["fold 1 level", { a: { b: 1 } }, "{a.b:1}"],
    ["fold 2 levels", { a: { b: { c: 1 } } }, "{a.b.c:1}"],
    ["no fold primitive", { a: 1 }, "{a:1}"],
    ["fold in multi-key", { a: { b: 1 }, c: { d: 2 } }, "{a.b:1,c.d:2}"],
    ["no fold multi-key value", { a: { b: 1, c: 2 } }, "{a:{b:1,c:2}}"],

    // Tables (object arrays with schema reuse)
    ["uniform table", [{ a: 1, b: 2 }, { a: 3, b: 4 }], "[:a,b|1,2|3,4]"],
    ["3-row table", [{ x: 1 }, { x: 2 }, { x: 3 }], "[:x|1|2|3]"],
    ["schema runs", [{ a: 1 }, { a: 2 }, { b: 3 }, { b: 4 }], "[:a|1|2|:b|3|4]"],

    // Object arrays without schema reuse (no table format)
    ["single obj array", [{ a: 1 }], "[{a:1}]"],
    ["no schema reuse", [{ a: 1 }, { b: 2 }], "[{a:1},{b:2}]"],

    // Single-item arrays
    ["single item", [42], "[42]"],
    ["single string", ["hello"], "[hello]"],

    // Nested
    ["nested", { users: [{ id: 1, name: "Alice" }] }, "{users:[{id:1,name:Alice}]}"],
  ]

  // Tests with pretty: true
  const prettyTests: [string, unknown, string][] = [
    ["pretty object", { a: 1, b: 2 }, "{\n  a: 1,\n  b: 2\n}"],
    ["pretty array inline", [1, 2, 3], "[ 1, 2, 3 ]"],
    ["pretty table", [{ x: 1 }, { x: 2 }], "[\n :x\n  1\n  2\n]"],
    ["pretty fold", { a: { b: 1 }, c: { d: 2 } }, "{\n  a.b: 1,\n  c.d: 2\n}"],
    ["pretty array value", { items: [1, 2] }, "{ items: [ 1, 2 ] }"],
    ["pretty table value", { labels: [{ name: "bug" }, { name: "fix" }] }, "{ labels: [\n :name\n  bug\n  fix\n] }"],
  ]

  let passed = 0
  let failed = 0

  console.log("=== Stringify Tests ===")
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

  console.log("\n=== Parser Tests ===")
  const parseTests: [string, string, unknown][] = [
    // Basic values
    ["parse null", "null", null],
    ["parse true", "true", true],
    ["parse false", "false", false],
    ["parse integer", "42", 42],
    ["parse negative", "-17", -17],
    ["parse float", "3.14", 3.14],

    // Unquoted strings
    ["parse unquoted string", "hello", "hello"],
    ["parse identifier", "api5", "api5"],

    // Quoted strings
    ["parse quoted string", '"hello world"', "hello world"],
    ["parse quoted numeric", '"123"', "123"],
    ["parse quoted reserved", '"true"', "true"],
    ["parse escape newline", '"hello\\nworld"', "hello\nworld"],
    ["parse escape quote", '"say \\"hi\\""', 'say "hi"'],

    // Arrays
    ["parse empty array", "[]", []],
    ["parse simple array", "[1,2,3]", [1, 2, 3]],
    ["parse string array", "[a,b]", ["a", "b"]],
    ["parse single item", "[42]", [42]],
    ["parse single string", "[hello]", ["hello"]],

    // Objects
    ["parse empty object", "{}", {}],
    ["parse simple object", "{name:Alice,age:30}", { name: "Alice", age: 30 }],
    ["parse nested object", "{a:{b:1,c:2}}", { a: { b: 1, c: 2 } }],

    // Key folding
    ["parse fold 1 level", "{a.b:1}", { a: { b: 1 } }],
    ["parse fold 2 levels", "{a.b.c:1}", { a: { b: { c: 1 } } }],
    ["parse fold multi-key", "{a.b:1,c.d:2}", { a: { b: 1 }, c: { d: 2 } }],
    ["parse fold deep", "{x.y.z:hello}", { x: { y: { z: "hello" } } }],
    ["parse quoted key literal", '{"a.b":1}', { "a.b": 1 }],

    // Tables
    ["parse uniform table", "[:a,b|1,2|3,4]", [{ a: 1, b: 2 }, { a: 3, b: 4 }]],
    ["parse 3-row table", "[:x|1|2|3]", [{ x: 1 }, { x: 2 }, { x: 3 }]],
    ["parse schema change", "[:a|1|2|:b|3|4]", [{ a: 1 }, { a: 2 }, { b: 3 }, { b: 4 }]],

    // Complex nested
    ["parse nested array obj", "{users:[{id:1,name:Alice}]}", { users: [{ id: 1, name: "Alice" }] }],
    ["parse obj array mixed", "[{a:1},{b:2}]", [{ a: 1 }, { b: 2 }]],
  ]

  for (const [name, input, expected] of parseTests) {
    try {
      const result = parse(input)
      if (JSON.stringify(result) === JSON.stringify(expected)) {
        console.log(`✓ ${name}`)
        passed++
      } else {
        console.log(`✗ ${name}`)
        console.log(`  input:    ${input}`)
        console.log(`  expected: ${JSON.stringify(expected)}`)
        console.log(`  got:      ${JSON.stringify(result)}`)
        failed++
      }
    } catch (e) {
      console.log(`✗ ${name}`)
      console.log(`  input:    ${input}`)
      console.log(`  error:    ${(e as Error).message}`)
      failed++
    }
  }

  console.log("\n=== Round-trip Tests (stringify → parse) ===")
  const roundTripData: unknown[] = [
    // Primitives
    null,
    true,
    false,
    42,
    3.14,
    "hello",
    "hello world",

    // Arrays
    [],
    [1, 2, 3],
    ["a", "b", "c"],

    // Objects
    {},
    { a: 1, b: 2 },
    { name: "Alice", age: 30 },

    // Key folding cases
    { a: { b: 1 } },
    { a: { b: { c: 1 } } },
    { a: { b: 1 }, c: { d: 2 } },
    { a: { b: 1, c: 2 } },

    // Tables
    [{ a: 1, b: 2 }, { a: 3, b: 4 }],
    [{ x: 1 }, { x: 2 }, { x: 3 }],
    [{ a: 1 }, { a: 2 }, { b: 3 }, { b: 4 }],

    // Mixed
    { name: "test", items: [1, 2, 3], nested: { x: true } },
    { users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] },
  ]

  for (const original of roundTripData) {
    const encoded = stringify(original)
    try {
      const decoded = parse(encoded)
      if (JSON.stringify(decoded) === JSON.stringify(original)) {
        console.log(`✓ round-trip: ${JSON.stringify(original).slice(0, 50)}`)
        passed++
      } else {
        console.log(`✗ round-trip: ${JSON.stringify(original).slice(0, 50)}`)
        console.log(`  encoded:  ${encoded}`)
        console.log(`  decoded:  ${JSON.stringify(decoded)}`)
        failed++
      }
    } catch (e) {
      console.log(`✗ round-trip: ${JSON.stringify(original).slice(0, 50)}`)
      console.log(`  encoded:  ${encoded}`)
      console.log(`  error:    ${(e as Error).message}`)
      failed++
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
}
