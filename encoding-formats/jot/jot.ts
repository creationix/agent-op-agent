/**
 * Jot - JSON Optimized for Tokens
 *
 * Features:
 * 1. Minimal quoting - only quote strings when necessary
 *    {name:Alice,age:30,city:New York}
 *
 * 2. Repeated objects - when an object has the same keys as previous,
 *    use {:val,val,...} syntax (values only, same key order)
 *    [{id:1,name:Alice},{id:2,name:Bob}] => [{id:1,name:Alice},{:2,Bob}]
 *
 * Quoting rules - quote string values only if:
 *   - Parses as a number ("123", "1.0" - not "api5", "v2")
 *   - Contains unsafe chars: : , { } [ ] "
 *   - Equals true, false, or null
 *   - Has leading/trailing whitespace or is empty
 *   - Contains control characters (codepoint < 32)
 */

const UNSAFE_STRINGS = new Set(["true", "false", "null"])
const UNSAFE_CHARS = [':', ',', '{', '}', '[', ']', '"', '\\']

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

function stringifyArray(arr: unknown[]): string {
  const items = arr.map(stringifyValue)

  // Single-item arrays: compact
  if (arr.length === 1) {
    return `[${items[0]}]`
  }

  // Regular array formatting
  if (currentOptions.pretty && arr.length > 0 && hasComplexItems(arr)) {
    depth++
    const formatted: string[] = []
    for (let i = 0; i < items.length; i++) {
      if (i === items.length - 1) {
        formatted.push(`${ind()}${items[i]} ]`)
      } else {
        formatted.push(`${ind()}${items[i]}`)
      }
    }
    depth--
    return `[\n${formatted.join(",\n")}`
  }

  const sep = currentOptions.pretty ? ", " : ","
  return currentOptions.pretty ? `[ ${items.join(sep)} ]` : `[${items.join(sep)}]`
}

function stringifyObject(obj: Record<string, unknown>): string {
  const keys = getObjectKeys(obj)

  const stringifyPair = (k: string, forPretty: boolean): string => {
    const val = obj[k]
    if (forPretty) {
      return `${k}: ${stringifyValue(val)}`
    }
    return `${k}:${stringifyValue(val)}`
  }

  if (currentOptions.pretty && keys.length > 1) {
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

    if (ch === "{") return this.parseObject()
    if (ch === "[") return this.parseArray()
    if (ch === '"') return this.parseQuotedString()

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
      const item = this.parseValue(",]")
      result.push(item)
      this.skipWhitespace()
      if (this.peek() === ",") {
        this.pos++ // skip comma
        this.skipWhitespace()
      }
    }

    this.pos++ // skip ]
    return result
  }

  // Parse object: {key:value,...}
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

      const key = this.parseKey()
      this.skipWhitespace()

      if (this.peek() !== ":") {
        throw new Error(`Expected ':' after key '${key}' at position ${this.pos}`)
      }
      this.pos++ // skip :

      const value = this.parseValue(",}")
      result[key] = value

      this.skipWhitespace()
      if (this.peek() === ",") {
        this.pos++ // skip comma
        this.skipWhitespace()
      }
    }

    this.pos++ // skip }
    return result
  }

  private parseKey(): string {
    this.skipWhitespace()

    // Handle quoted keys
    if (this.peek() === '"') {
      return this.parseQuotedString()
    }

    const start = this.pos
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (/[:\,{}\[\]]/.test(ch) || /\s/.test(ch)) break
      this.pos++
    }
    const key = this.input.slice(start, this.pos)
    if (key === "") {
      throw new Error(`Expected key at position ${this.pos}`)
    }
    return key
  }
}

export function parse(input: string): unknown {
  return new JotParser(input).parse()
}

// ============ TESTS ============
// Run with: bun jot.ts
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
    ["leading space", " hi", '" hi"'],
    ["trailing space", "hi ", '"hi "'],

    // Arrays
    ["empty array", [], "[]"],
    ["simple array", [1, 2, 3], "[1,2,3]"],
    ["string array", ["a", "b"], '[a,b]'],

    // Objects
    ["empty object", {}, "{}"],
    ["simple object", { name: "Alice", age: 30 }, "{name:Alice,age:30}"],
    ["nested object", { a: { b: 1, c: 2 } }, "{a:{b:1,c:2}}"],

    // Object arrays
    ["object array", [{ a: 1, b: 2 }, { a: 3, b: 4 }], "[{a:1,b:2},{a:3,b:4}]"],
    ["different keys", [{ a: 1 }, { b: 2 }], "[{a:1},{b:2}]"],

    // Single object arrays
    ["single obj array", [{ a: 1 }], "[{a:1}]"],

    // Single-item arrays
    ["single item", [42], "[42]"],
    ["single string", ["hello"], "[hello]"],

    // Nested
    ["nested users", { users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] }, "{users:[{id:1,name:Alice},{id:2,name:Bob}]}"],
  ]

  // Tests with pretty: true
  const prettyTests: [string, unknown, string][] = [
    ["pretty object", { a: 1, b: 2 }, "{ a: 1,\n  b: 2 }"],
    ["pretty array inline", [1, 2, 3], "[ 1, 2, 3 ]"],
    ["pretty array value", { items: [1, 2] }, "{ items: [ 1, 2 ] }"],
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
    ["parse quoted key", '{"a.b":1}', { "a.b": 1 }],

    // Complex nested
    ["parse nested array obj", "{users:[{id:1,name:Alice}]}", { users: [{ id: 1, name: "Alice" }] }],
    ["parse obj array", "[{a:1,b:2},{a:3,b:4}]", [{ a: 1, b: 2 }, { a: 3, b: 4 }]],
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
    { a: { b: 1, c: 2 } },

    // Repeated objects
    [{ a: 1, b: 2 }, { a: 3, b: 4 }],
    [{ x: 1 }, { x: 2 }, { x: 3 }],
    [{ a: 1 }, { b: 2 }],  // Different keys

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
