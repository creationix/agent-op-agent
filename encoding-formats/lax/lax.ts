// Lax: Relaxed JSON syntax for LLMs
// Features:
// - No quotes around keys
// - No commas between items (space-separated)
// - Strings always quoted

export function stringify(data: unknown): string {
  if (!data || typeof data !== "object") {
    return JSON.stringify(data)
  } else if (Array.isArray(data)) {
    return `[${data.map(item => stringify(item)).join(" ")}]`
  } else {
    return `{${Object.entries(data).map(
      ([key, value]) => `${key}:${stringify(value)}`
    ).join(" ")}}`
  }
}

// ============ PARSER ============

class LaxParser {
  private pos = 0
  constructor(private input: string) {}

  parse(): unknown {
    this.skipWhitespace()
    const result = this.parseValue()
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

  private parseValue(): unknown {
    this.skipWhitespace()
    const ch = this.peek()

    if (ch === "{") return this.parseObject()
    if (ch === "[") return this.parseArray()
    if (ch === '"') return this.parseString()

    // Try to parse keyword or number
    return this.parseAtom()
  }

  private parseString(): string {
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

  private parseAtom(): unknown {
    const start = this.pos
    // Read until we hit whitespace or a structural character
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (/[\s{}\[\]:]/.test(ch)) break
      this.pos++
    }

    const token = this.input.slice(start, this.pos)
    if (token === "") {
      throw new Error(`Unexpected character at position ${this.pos}: '${this.peek()}'`)
    }

    // Keywords
    if (token === "null") return null
    if (token === "true") return true
    if (token === "false") return false

    // Try number
    const num = Number(token)
    if (!isNaN(num)) return num

    // Otherwise it's an unquoted string (shouldn't happen in valid Lax)
    throw new Error(`Invalid token '${token}' at position ${start}`)
  }

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
      result.push(this.parseValue())
      this.skipWhitespace()
    }

    this.pos++ // skip ]
    return result
  }

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

      // Parse key (unquoted identifier)
      const key = this.parseKey()
      this.skipWhitespace()

      if (this.peek() !== ":") {
        throw new Error(`Expected ':' after key '${key}' at position ${this.pos}`)
      }
      this.pos++ // skip :

      const value = this.parseValue()
      result[key] = value
      this.skipWhitespace()
    }

    this.pos++ // skip }
    return result
  }

  private parseKey(): string {
    const start = this.pos
    // Keys are unquoted identifiers - read until : or whitespace
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (/[\s{}[\]:]/.test(ch)) break
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
  return new LaxParser(input).parse()
}

// ============ TESTS ============
if ((import.meta as { main?: boolean }).main) {
  const tests: [string, string, unknown][] = [
    // Primitives
    ["null", "null", null],
    ["true", "true", true],
    ["false", "false", false],
    ["integer", "42", 42],
    ["negative", "-17", -17],
    ["float", "3.14", 3.14],
    ["string", '"hello"', "hello"],
    ["string with space", '"hello world"', "hello world"],
    ["string with escape", '"hello\\nworld"', "hello\nworld"],
    ["string with quote", '"say \\"hi\\""', 'say "hi"'],

    // Arrays
    ["empty array", "[]", []],
    ["simple array", "[1 2 3]", [1, 2, 3]],
    ["string array", '["a" "b" "c"]', ["a", "b", "c"]],
    ["mixed array", '[1 "two" true null]', [1, "two", true, null]],
    ["nested array", "[[1 2] [3 4]]", [[1, 2], [3, 4]]],

    // Objects
    ["empty object", "{}", {}],
    ["simple object", '{name:"Alice" age:30}', { name: "Alice", age: 30 }],
    ["nested object", '{a:{b:1}}', { a: { b: 1 } }],
    ["object with array", '{items:[1 2 3]}', { items: [1, 2, 3] }],

    // Complex
    ["config example", '{name:"config" version:"1.0.0" enabled:true maxRetries:3}',
      { name: "config", version: "1.0.0", enabled: true, maxRetries: 3 }],
  ]

  let passed = 0
  let failed = 0

  console.log("=== Lax Parser Tests ===")
  for (const [name, input, expected] of tests) {
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
  const roundTripTests: unknown[] = [
    null,
    true,
    false,
    42,
    3.14,
    "hello",
    "hello world",
    [],
    [1, 2, 3],
    {},
    { a: 1, b: 2 },
    { name: "test", items: [1, 2, 3], nested: { x: true } },
  ]

  for (const original of roundTripTests) {
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
