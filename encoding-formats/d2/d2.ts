// ============ DECODER ============

export function decode(input: string): unknown {
  const lines = input.split('\n').filter(line => line.trim() !== '')
  const cache: (unknown | undefined)[] = new Array(lines.length)
  const resolving = new Set<number>()

  function resolve(lineNum: number): unknown {
    if (cache[lineNum] !== undefined) return cache[lineNum]
    if (resolving.has(lineNum)) {
      throw new Error(`Circular reference at line ${lineNum + 1}`)
    }
    resolving.add(lineNum)

    const line = lines[lineNum]
    const parsed = JSON.parse(line)

    // If the line is just a primitive (number, string, bool, null), return it directly
    // Don't resolve numbers as references at the top level of a line
    let result: unknown
    if (Array.isArray(parsed)) {
      result = resolveArray(parsed)
    } else if (parsed && typeof parsed === 'object') {
      result = resolveObject(parsed as Record<string, unknown>)
    } else {
      result = parsed
    }

    cache[lineNum] = result
    resolving.delete(lineNum)
    return result
  }

  function resolveArray(arr: unknown[]): unknown {
    // Check for schema reference (negative first element)
    if (arr.length > 0 && typeof arr[0] === 'number' && arr[0] < 0) {
      const schemaLineNum = -arr[0] - 1
      const keys = resolve(schemaLineNum) as string[]
      const values = arr.slice(1).map(resolveRef)
      const obj: Record<string, unknown> = {}
      for (let i = 0; i < keys.length; i++) {
        obj[keys[i]] = values[i]
      }
      return obj
    }
    return arr.map(resolveRef)
  }

  function resolveObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveRef(v)
    }
    return result
  }

  // Inside arrays/objects, numbers are line references
  function resolveRef(val: unknown): unknown {
    if (typeof val === 'number' && Number.isInteger(val)) {
      return resolve(val - 1)
    }
    if (Array.isArray(val)) {
      return resolveArray(val)
    }
    if (val && typeof val === 'object') {
      return resolveObject(val as Record<string, unknown>)
    }
    return val
  }

  // The last line is the root value
  return resolve(lines.length - 1)
}

// ============ ENCODER ============

interface EncodeOptions {
  objectThreshold?: number; // threshold for inline objects vs. own line
  arrayThreshold?: number; // threshold for inline arrays vs. own line
  stringThreshold?: number; // threshold for inline strings vs. own line
}

export function encode(value: unknown, opts: EncodeOptions = {}): string {
  const objectThreshold = opts.objectThreshold ?? 4;
  const arrayThreshold = opts.arrayThreshold ?? 1;
  const stringThreshold = opts.stringThreshold ?? 2;

  const lines: string[] = [];
  const seenLines: Record<string, number> = {};
  // Map from object to it's shape key
  const duplicatedShapes = new Map<unknown, string>();
  const shapeCounts: Record<string, number> = {};
  const stringCounts: Record<string, number> = {};
  findDuplicates(value);

  write(value);
  return lines.join('\n');

  function findDuplicates(val: unknown): void {
    if (typeof val === 'string') {
      stringCounts[val] = (stringCounts[val] || 0) + 1;
    } else if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        val.forEach(findDuplicates);
      } else {
        let shape = duplicatedShapes.get(val);
        if (!shape) {
          shape = Object.keys(val).join(',');
          duplicatedShapes.set(val, shape);
        }
        shapeCounts[shape] = (shapeCounts[shape] || 0) + 1;
        for (const child of Object.values(val)) {
          findDuplicates(child);
        }
      }
    }
  }

  function pushLine(line: string): number {
    let index = seenLines[line];
    if (index === undefined) {
      index = lines.push(line);
      seenLines[line] = index;
    }
    return index;
  }

  function encodeItem(item: unknown): string {
    // Always encode numbers on own line to avoid ambiguity
    // A number inside an array or object is always a line reference
    if (typeof item === 'number') {
      return JSON.stringify(write(item));
    }
    if (item && typeof item === 'object') {
      if (Array.isArray(item)) {
        if (item.length >= arrayThreshold) {
          // Non-empty arrays should be on own line to enable random access and deduplication
          return JSON.stringify(write(item));
        }
        return encodeArray(item);
      }
      if (Object.keys(item).length >= objectThreshold) {
        // Non-empty objects should be on own line to enable random access and deduplication
        return JSON.stringify(write(item));
      }
      return encodeObject(item as Record<string, unknown>);
    }
    if (
      typeof item === 'string' &&
      stringCounts[item] &&
      stringCounts[item] >= stringThreshold
    ) {
      // Encode duplicated strings on own line to save space
      return JSON.stringify(write(item));
    }
    // For other primitive types (boolean, null, number, non-duplicated string), inline them
    return JSON.stringify(item);
  }

  function encodeObject(obj: Record<string, unknown>): string {
    // Encode objects with duplicated shapes as arrays pointing to schema to save space
    const key = duplicatedShapes.get(obj);
    if (((key && shapeCounts[key]) || 0) > 1) {
      const values = Object.values(obj).map(encodeItem).join(',');
      return `[${-write(Object.keys(obj))},${values}]`;
    } else {
      // Encode other objects normally
      return `{${Object.entries(obj)
        .map(([k, v]) => `${JSON.stringify(k)}:${encodeItem(v)}`)
        .join(',')}}`;
    }
  }

  function encodeArray(arr: unknown[]): string {
    return `[${arr.map(encodeItem).join(',')}]`;
  }

  function write(val: unknown): number {
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        return pushLine(encodeArray(val));
      }
      return pushLine(encodeObject(val as Record<string, unknown>));
    }
    return pushLine(JSON.stringify(val));
  }
}
