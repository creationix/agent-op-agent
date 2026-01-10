/**
 * Smart JSON formatter - applies intelligent line-breaking rules
 * similar to Jot's pretty printer to reduce token count while
 * maintaining readability.
 *
 * Rules:
 * - Single-key objects stay inline: { "key": value }
 * - Simple arrays (primitives only) stay inline: [ 1, 2, 3 ]
 * - Multi-key objects: first key on same line as brace, closing brace on last line
 *   { "type": "click",
 *     "x": 100 }
 * - Arrays with complex items: similar treatment
 */

export interface FormatOptions {
  indent?: string // default "  "
}

let currentIndent = "  "
let depth = 0

function ind(): string {
  return currentIndent.repeat(depth)
}

function isSimpleValue(value: unknown): boolean {
  return value === null || typeof value !== "object"
}

function hasComplexItems(arr: unknown[]): boolean {
  return arr.some((item) => item !== null && typeof item === "object")
}

function formatValue(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "boolean") return String(value)
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return JSON.stringify(value)

  if (Array.isArray(value)) {
    return formatArray(value)
  }

  if (typeof value === "object") {
    return formatObject(value as Record<string, unknown>)
  }

  return String(value)
}

function formatArray(arr: unknown[]): string {
  if (arr.length === 0) return "[]"

  // Single-item arrays: compact
  if (arr.length === 1) {
    return `[${formatValue(arr[0])}]`
  }

  // Simple arrays (no complex items): inline with spaces
  if (!hasComplexItems(arr)) {
    const items = arr.map(formatValue).join(", ")
    return `[ ${items} ]`
  }

  // Complex arrays: items on separate lines, closing bracket on last line
  depth++
  const items: string[] = []
  for (let i = 0; i < arr.length; i++) {
    const v = formatValue(arr[i])
    if (i === arr.length - 1) {
      // Last item: add closing bracket on same line
      items.push(`${ind()}${v} ]`)
    } else {
      items.push(`${ind()}${v}`)
    }
  }
  depth--
  return `[\n${items.join(",\n")}`
}

function formatObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj)

  if (keys.length === 0) return "{}"

  // Single-key objects: inline
  if (keys.length === 1) {
    const k = keys[0]
    return `{ ${JSON.stringify(k)}: ${formatValue(obj[k])} }`
  }

  // Multi-key objects: first key on same line as brace, closing brace on last line
  depth++
  const pairs: string[] = []
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    const v = formatValue(obj[k])
    if (i === 0) {
      // First key: no indent, will follow opening brace
      pairs.push(`${JSON.stringify(k)}: ${v}`)
    } else if (i === keys.length - 1) {
      // Last key: add closing brace on same line
      pairs.push(`${ind()}${JSON.stringify(k)}: ${v} }`)
    } else {
      pairs.push(`${ind()}${JSON.stringify(k)}: ${v}`)
    }
  }
  depth--
  // First line has opening brace + space, rest are indented
  return `{ ${pairs.join(",\n")}`
}

export function format(data: unknown, options: FormatOptions = {}): string {
  currentIndent = options.indent ?? "  "
  depth = 0
  return formatValue(data)
}

// CLI: format JSON files
if ((import.meta as { main?: boolean }).main) {
  const { readFileSync, writeFileSync, readdirSync } = await import("node:fs")
  const { join, dirname } = await import("node:path")

  const scriptDir = dirname(import.meta.path)

  // Process all .json files in the directory (skip .smart.json)
  const files = readdirSync(scriptDir).filter((f) => f.endsWith(".json") && !f.includes(".smart."))

  for (const file of files) {
    const path = join(scriptDir, file)
    const data = JSON.parse(readFileSync(path, "utf-8"))
    const formatted = format(data)
    const outPath = path.replace(".json", ".smart.json")
    writeFileSync(outPath, formatted + "\n")
    console.log(`${file} → ${file.replace(".json", ".smart.json")}`)
  }
}
