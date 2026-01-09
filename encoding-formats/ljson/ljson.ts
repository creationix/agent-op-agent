// LJSON: A lightweight JSON variant optimized for token efficiency in LLMs.
// Features:
// - Always omits quotes around keys (APIs must not use keys that need quoting)
// - Never use commas between items in arrays or objects
export function stringify(data: unknown): string {
  if (!data || typeof data !== "object") {
    // Primitive value
    return JSON.stringify(data)
  } else if (Array.isArray(data)) {
    return `[${data.map(item => stringify(item)).join(" ")}]`
  } else {
    return `{${Object.entries(data).map(
      ([key, value]) => `${key}:${stringify(value)}`
    ).join(" ")}}`
  }
}
