/**
 * Jot - JSON Optimized for Tokens
 *
 * Features:
 * 1. Unquoted strings - only quote when necessary
 * 2. Key folding - {a:{b:1}} => {a.b:1}
 * 3. Tables - [{a:1},{a:2}] => {{:a;1;2}} with schema changes via :newschema;
 *
 * Pretty-print rules (compact = braces on content lines):
 *
 * Objects:
 *   - Single key: always compact `{ key: value }`
 *   - Multi-key, array item: compact `{ a: 1,\n  b: 2 }` unless last value is multi-line
 *   - Multi-key, array item with multi-line last value: expanded
 *   - Multi-key, other: expanded `{\n  a: 1,\n  b: 2\n}`
 *
 * Arrays:
 *   - Empty: `[]`
 *   - Single item: compact `[item]`
 *   - 2+ simple items: spaced `[ a, b ]`
 *   - 2+ complex items: expanded `[\n  ...,\n  ...\n]`
 *
 * Tables:
 *   - Only when 2+ consecutive objects share schema
 *   - Otherwise use regular array syntax
 */

const RESERVED_WORDS = new Set(["true", "false", "null"])
const UNSAFE_CHARS = [':', ',', '{', '}', '[', ']', '"', ';', '\\']

function needsQuotes(str: string, unsafeChars: string[]): boolean {
  if (str === "" || str.trim() !== str) return true
  if (RESERVED_WORDS.has(str)) return true
  if (!isNaN(Number(str))) return true
  if (unsafeChars.some(c => str.includes(c))) return true
  if ([...str].some(c => c.charCodeAt(0) < 32)) return true
  return false
}

const quoteString = (s: string) => needsQuotes(s, UNSAFE_CHARS) ? JSON.stringify(s) : s
const quoteKey = (s: string) => needsQuotes(s, [...UNSAFE_CHARS, '.']) ? JSON.stringify(s) : s
const needsKeyQuoting = (s: string) => needsQuotes(s, [...UNSAFE_CHARS, '.'])

function getObjectKeys(obj: object): string[] {
  return Object.keys(obj)
}

// Check if value is a foldable chain: single-key objects nested
// Skip folding if any key contains "." (would be ambiguous with fold syntax)
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
    const key = keys[0]
    // Don't fold keys containing "." - they need quoting
    if (key.includes(".")) break
    path.push(key)
    current = (current as Record<string, unknown>)[key]
  }

  if (path.length < 1) return null
  return { path, leaf: current }
}

// Check if array is all objects (candidate for table)
function isAllObjects(arr: unknown[]): boolean {
  return arr.length >= 2 && arr.every(item =>
    item !== null && typeof item === "object" && !Array.isArray(item)
  )
}

// Check if table format provides benefit (at least one schema reused)
function hasSchemaReuse(arr: Record<string, unknown>[]): boolean {
  const groups = groupBySchema(arr)
  return groups.some(g => g.objects.length >= 2)
}

// Options for stringify
export interface StringifyOptions {
  pretty?: boolean
  indent?: string
}

let currentOptions: StringifyOptions = { pretty: false, indent: "  " }
let depth = 0

function ind(): string {
  return currentOptions.pretty ? currentOptions.indent!.repeat(depth) : ""
}

// atLineStart: true when value will be at start of a line (array items), false when after key:
function stringifyValue(value: unknown, atLineStart = false): string {
  if (value === null) return "null"
  if (value === true) return "true"
  if (value === false) return "false"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return quoteString(value)

  if (Array.isArray(value)) {
    return stringifyArray(value)
  }

  if (typeof value === "object") {
    return stringifyObject(value as Record<string, unknown>, atLineStart)
  }

  return String(value)
}

function hasComplexItems(arr: unknown[]): boolean {
  return arr.some(item => item !== null && typeof item === "object")
}

// Group consecutive objects by their schema (sorted key list)
function groupBySchema(arr: Record<string, unknown>[]): { keys: string[], objects: Record<string, unknown>[] }[] {
  const groups: { keys: string[], objects: Record<string, unknown>[] }[] = []

  for (const obj of arr) {
    const keys = getObjectKeys(obj)
    const keyStr = keys.join(",")

    // Check if matches current group
    if (groups.length > 0) {
      const lastGroup = groups[groups.length - 1]
      if (lastGroup.keys.join(",") === keyStr) {
        lastGroup.objects.push(obj)
        continue
      }
    }

    // Start new group
    groups.push({ keys, objects: [obj] })
  }

  return groups
}

function stringifyArray(arr: unknown[]): string {
  // Check for object array with schema reuse - use table format
  if (isAllObjects(arr) && hasSchemaReuse(arr as Record<string, unknown>[])) {
    return stringifyTable(arr as Record<string, unknown>[])
  }

  // Single-item arrays: compact
  if (arr.length === 1) {
    return `[${stringifyValue(arr[0])}]`
  }

  // Regular array formatting
  if (currentOptions.pretty && arr.length > 0 && hasComplexItems(arr)) {
    depth++
    const items = arr.map(item => `${ind()}${stringifyValue(item, true)}`)
    depth--
    // Expanded format for 2+ items: ] on own line
    return `[\n${items.join(",\n")}\n${ind()}]`
  }

  const sep = currentOptions.pretty ? ", " : ","
  const items = arr.map(stringifyValue).join(sep)
  return currentOptions.pretty ? `[ ${items} ]` : `[${items}]`
}

function stringifyTable(arr: Record<string, unknown>[]): string {
  const groups = groupBySchema(arr)
  const sep = currentOptions.pretty ? ", " : ","

  if (currentOptions.pretty) {
    depth++
    const schemaInd = ind()  // 1 level for schema rows
    depth++
    const dataInd = ind()    // 2 levels for data rows
    const rows: string[] = []

    for (const group of groups) {
      // Schema row
      rows.push(schemaInd + `:${group.keys.map(k => quoteKey(k)).join(sep)}`)
      // Data rows - stringify with depth at 2 levels
      for (const obj of group.objects) {
        rows.push(dataInd + group.keys.map(k => stringifyValue(obj[k])).join(sep))
      }
    }

    depth -= 2
    return `{{\n${rows.join("\n")}\n${ind()}}}`
  }

  // Non-pretty mode
  const parts: string[] = []
  for (const group of groups) {
    parts.push(`:${group.keys.map(k => quoteKey(k)).join(sep)}`)
    for (const obj of group.objects) {
      parts.push(group.keys.map(k => stringifyValue(obj[k])).join(sep))
    }
  }
  return `{{${parts.join(";")}}}`
}

function stringifyObject(obj: Record<string, unknown>, atLineStart = false): string {
  const keys = getObjectKeys(obj)

  const stringifyPair = (k: string, forPretty: boolean): string => {
    const val = obj[k]
    const quotedKey = quoteKey(k)
    // Try to fold (only if key doesn't need quoting - has no special chars)
    if (!needsKeyQuoting(k) && val !== null && typeof val === "object" && !Array.isArray(val)) {
      const fold = getFoldPath(val)
      if (fold) {
        const foldedKey = `${k}.${fold.path.join(".")}`
        if (forPretty) {
          // Value after key: is not at line start
          return `${foldedKey}: ${stringifyValue(fold.leaf, false)}`
        }
        return `${foldedKey}:${stringifyValue(fold.leaf)}`
      }
    }
    if (forPretty) {
      // Value after key: is not at line start
      return `${quotedKey}: ${stringifyValue(val, false)}`
    }
    return `${quotedKey}:${stringifyValue(val)}`
  }

  if (currentOptions.pretty && keys.length > 1) {
    depth++
    // First, stringify all pairs to check if last is multi-line
    const rawPairs = keys.map(k => stringifyPair(k, true))
    const lastIsMultiLine = rawPairs[rawPairs.length - 1].endsWith('}') ||
                            rawPairs[rawPairs.length - 1].endsWith(']')

    // Array items with simple last value: compact format
    const useCompact = atLineStart && !lastIsMultiLine

    const pairs: string[] = []
    for (let i = 0; i < keys.length; i++) {
      if (i === 0 && useCompact) {
        // First pair on same line as { - no indent
        pairs.push(rawPairs[i])
      } else {
        pairs.push(`${ind()}${rawPairs[i]}`)
      }
    }
    depth--

    if (useCompact) {
      return `{ ${pairs.join(",\n")} }`
    }
    // Expanded format: newlines for open and close
    return `{\n${pairs.join(",\n")}\n${ind()}}`
  }
  if (currentOptions.pretty && keys.length === 1) {
    return `{ ${stringifyPair(keys[0], true)} }`
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
    const result = this.parseValue("")
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

  private parseValue(terminators = ""): unknown {
    this.skipWhitespace()
    const ch = this.peek()

    if (ch === "{") {
      if (this.input[this.pos + 1] === "{") return this.parseTable()
      return this.parseObject()
    }
    if (ch === "[") return this.parseArray()
    if (ch === '"') return this.parseQuotedString()

    return this.parseAtom(terminators)
  }

  private parseQuotedString(): string {
    if (this.peek() !== '"') {
      throw new Error(`Expected '"' at position ${this.pos}`)
    }
    this.pos++

    let result = ""
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (ch === '"') {
        this.pos++
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

  private parseAtom(terminators: string): unknown {
    const start = this.pos

    if (terminators === "") {
      const token = this.input.slice(start).trim()
      this.pos = this.input.length

      if (token === "") {
        throw new Error(`Unexpected end of input at position ${start}`)
      }

      if (token === "null") return null
      if (token === "true") return true
      if (token === "false") return false

      const num = Number(token)
      if (!isNaN(num)) return num

      return token
    }

    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (terminators.includes(ch)) break
      this.pos++
    }

    const token = this.input.slice(start, this.pos).trim()
    if (token === "") {
      throw new Error(`Unexpected character at position ${this.pos}: '${this.peek()}'`)
    }

    if (token === "null") return null
    if (token === "true") return true
    if (token === "false") return false

    const num = Number(token)
    if (!isNaN(num) && token !== "") return num

    return token
  }

  private parseArray(): unknown[] {
    if (this.peek() !== "[") {
      throw new Error(`Expected '[' at position ${this.pos}`)
    }
    this.pos++

    const result: unknown[] = []
    this.skipWhitespace()

    while (this.peek() !== "]") {
      if (this.pos >= this.input.length) {
        throw new Error("Unterminated array")
      }
      const item = this.parseValue(",]")
      result.push(item)
      this.skipWhitespace()
      if (this.peek() === ",") {
        this.pos++
        this.skipWhitespace()
      }
    }

    this.pos++
    return result
  }

  // Parse table: {{:schema;row;row;:newschema;row}}
  private parseTable(): unknown[] {
    if (this.input.slice(this.pos, this.pos + 2) !== "{{") {
      throw new Error(`Expected '{{' at position ${this.pos}`)
    }
    this.pos += 2

    const result: Record<string, unknown>[] = []
    let currentSchema: string[] = []
    this.skipWhitespace()

    while (this.input.slice(this.pos, this.pos + 2) !== "}}") {
      if (this.pos >= this.input.length) {
        throw new Error("Unterminated table")
      }

      this.skipWhitespace()

      // Check for schema row (starts with :)
      if (this.peek() === ":") {
        this.pos++ // skip :
        currentSchema = this.parseSchemaRow()
      } else {
        // Data row
        if (currentSchema.length === 0) {
          throw new Error(`Data row without schema at position ${this.pos}`)
        }
        const values = this.parseDataRow(currentSchema.length)
        const obj: Record<string, unknown> = {}
        for (let i = 0; i < currentSchema.length; i++) {
          obj[currentSchema[i]] = values[i]
        }
        result.push(obj)
      }

      this.skipWhitespace()
      if (this.peek() === ";") {
        this.pos++
        this.skipWhitespace()
      }
    }

    this.pos += 2 // skip }}
    return result
  }

  private parseSchemaRow(): string[] {
    const cols: string[] = []
    let col = ""

    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (ch === "}" && this.input[this.pos + 1] === "}") {
        if (col.trim()) cols.push(col.trim())
        break
      }
      if (ch === ";" || ch === "\n") {
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
      const terminators = i < colCount - 1 ? ",;}\n" : ";}\n"
      const value = this.parseTableValue(terminators)
      values.push(value)
      this.skipWhitespace()
      if (this.peek() === ",") {
        this.pos++
      }
    }

    return values
  }

  private parseTableValue(terminators: string): unknown {
    this.skipWhitespace()
    const ch = this.peek()

    if (ch === '"') return this.parseQuotedString()
    if (ch === "{") {
      if (this.input[this.pos + 1] === "{") return this.parseTable()
      return this.parseObject()
    }
    if (ch === "[") return this.parseArray()

    const start = this.pos
    while (this.pos < this.input.length) {
      const c = this.input[this.pos]
      if (c === "}" && this.input[this.pos + 1] === "}") break
      if (terminators.includes(c)) break
      this.pos++
    }

    const token = this.input.slice(start, this.pos).trim()
    if (token === "") return null

    if (token === "null") return null
    if (token === "true") return true
    if (token === "false") return false

    const num = Number(token)
    if (!isNaN(num)) return num

    return token
  }

  private parseObject(): Record<string, unknown> {
    if (this.peek() !== "{") {
      throw new Error(`Expected '{' at position ${this.pos}`)
    }
    this.pos++

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
      this.pos++

      const value = this.parseValue(",}")

      if (quoted) {
        result[keyPath] = value
      } else {
        const unfolded = this.unfoldKey(keyPath, value)
        this.mergeObjects(result, unfolded)
      }

      this.skipWhitespace()
      if (this.peek() === ",") {
        this.pos++
        this.skipWhitespace()
      }
    }

    this.pos++
    return result
  }

  private parseKey(): { key: string; quoted: boolean } {
    this.skipWhitespace()

    if (this.peek() === '"') {
      return { key: this.parseQuotedString(), quoted: true }
    }

    const start = this.pos
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (/[:\,{}\[\];]/.test(ch) || /\s/.test(ch)) break
      this.pos++
    }
    const key = this.input.slice(start, this.pos)
    if (key === "") {
      throw new Error(`Expected key at position ${this.pos}`)
    }
    return { key, quoted: false }
  }

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
if ((import.meta as { main?: boolean }).main) {
  const tests: [string, unknown, string][] = [
    // Basic values
    ["null", null, "null"],
    ["true", true, "true"],
    ["false", false, "false"],
    ["number", 42, "42"],
    ["float", 3.14, "3.14"],

    // Strings
    ["simple string", "hello", "hello"],
    ["string with space", "hello world", "hello world"],
    ["empty string", "", '""'],
    ["numeric string", "123", '"123"'],
    ["reserved word", "true", '"true"'],
    ["contains colon", "a:b", '"a:b"'],
    ["contains semicolon", "a;b", '"a;b"'],

    // Arrays
    ["empty array", [], "[]"],
    ["simple array", [1, 2, 3], "[1,2,3]"],
    ["string array", ["a", "b"], "[a,b]"],

    // Objects
    ["empty object", {}, "{}"],
    ["simple object", { name: "Alice", age: 30 }, "{name:Alice,age:30}"],

    // Key folding
    ["fold 1 level", { a: { b: 1 } }, "{a.b:1}"],
    ["fold 2 levels", { a: { b: { c: 1 } } }, "{a.b.c:1}"],
    ["no fold multi-key", { a: { b: 1, c: 2 } }, "{a:{b:1,c:2}}"],
    ["key with dot", { "a.b": 1 }, '{"a.b":1}'],
    ["key with dot nested", { "a.b": { c: 1 } }, '{"a.b":{c:1}}'],

    // Tables (only when schema reuse)
    ["uniform table", [{ a: 1, b: 2 }, { a: 3, b: 4 }], "{{:a,b;1,2;3,4}}"],
    ["3-row table", [{ x: 1 }, { x: 2 }, { x: 3 }], "{{:x;1;2;3}}"],
    ["mixed schema with reuse", [{ a: 1 }, { a: 2 }, { b: 3 }], "{{:a;1;2;:b;3}}"],

    // No table when no schema reuse
    ["no reuse", [{ a: 1 }, { b: 2 }], "[{a:1},{b:2}]"],
    ["single obj", [{ a: 1 }], "[{a:1}]"],
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
      console.log(`  expected: ${expected}`)
      console.log(`  got:      ${result}`)
      failed++
    }
  }

  console.log("\n=== Parser Tests ===")
  const parseTests: [string, string, unknown][] = [
    ["parse null", "null", null],
    ["parse true", "true", true],
    ["parse number", "42", 42],
    ["parse string", "hello", "hello"],
    ["parse quoted", '"hello world"', "hello world"],

    ["parse array", "[1,2,3]", [1, 2, 3]],
    ["parse object", "{name:Alice,age:30}", { name: "Alice", age: 30 }],

    // Key unfolding
    ["parse fold", "{a.b:1}", { a: { b: 1 } }],
    ["parse fold deep", "{a.b.c:1}", { a: { b: { c: 1 } } }],
    ["parse quoted dot key", '{"a.b":1}', { "a.b": 1 }],

    // Tables
    ["parse table", "{{:a,b;1,2;3,4}}", [{ a: 1, b: 2 }, { a: 3, b: 4 }]],
    ["parse schema change", "{{:a;1;:b;2}}", [{ a: 1 }, { b: 2 }]],
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

  console.log("\n=== Round-trip Tests ===")
  const roundTripData: unknown[] = [
    null, true, false, 42, "hello",
    [], [1, 2, 3],
    {}, { a: 1, b: 2 },
    { a: { b: 1 } },
    { a: { b: { c: 1 } } },
    [{ a: 1, b: 2 }, { a: 3, b: 4 }],
    [{ a: 1 }, { b: 2 }],
    { users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] },
    { "a.b": 1 },  // key with dot
    { "x;y": "test" },  // key with semicolon
    "a;b",  // string with semicolon
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
