// LJSON: A lightweight JSON variant optimized for token efficiency in LLMs.
// Features:
// - Only use quotes on strings when necessary (i.e., if they contain commas or need to be forced as strings)
export function stringify(data: unknown): string {
  if (typeof data === "string") {
    return needsQuoting(data) ? JSON.stringify(data) : data;
  }
  if (!data || typeof data !== "object") {
    // Primitive value
    return JSON.stringify(data)
  } else if (Array.isArray(data)) {
    return `[${data.map(item => stringify(item)).join(",")}]`
  } else {
    return `{${Object.entries(data).map(
      ([key, value]) => `${key}:${stringify(value)}`
    ).join(",")}}`
  }
}

const unsafeStrings = new Set([
  "true",
  "false",
  "null",
]);

const unsafeChars = [
  ',',
  '"',
  ':',
  '{',
  '}',
  '[',
  ']',
  '(',
  ')',
]

function needsQuoting(str: string): boolean {
  if (str.trim() !== str) return true; // Leading or trailing whitespace
  if (str === "") return true; // Empty string
  if (unsafeStrings.has(str)) return true;
  // Looks like a number
  if (!isNaN(Number(str))) return true;
  if (unsafeChars.some(char => str.includes(char))) return true;
  if ([...str].some(c => c.charCodeAt(0) < 32)) return true; // Control characters
  return false;
}

