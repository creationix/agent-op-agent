// Lax: Relaxed JSON syntax for LLMs
// Features:
// - No quotes around keys
// - No commas between items
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
