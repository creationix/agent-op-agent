# Jot Format

Jot is JSON with three modifications:

1. **Minimal quoting** — Strings don't need quotes unless ambiguous
2. **Key folding** — Single-key object chains collapse: `{"a":{"b":1}}` → `{a.b:1}`
3. **Tables** — Arrays of uniform objects use `[:schema|row|row]` syntax

Everything else is exactly like JSON: `{key:value}` objects, `[item,item]` arrays, same data types.

## Complete Example

**JSON:**
```json
{
  "config": {
    "name": "my-app",
    "version": "1.0.0"
  },
  "users": [
    {"id": 1, "name": "Alice", "role": "admin"},
    {"id": 2, "name": "Bob", "role": "user"}
  ],
  "events": [
    {"type": "click", "x": 100, "y": 200},
    {"type": "click", "x": 150, "y": 250},
    {"type": "scroll", "offset": 500},
    {"type": "resize", "width": 1920, "height": 1080}
  ],
  "tags": ["production", "api"],
  "metadata": {
    "nested": {
      "value": 42
    }
  }
}
```

**Jot:**
```jot
{
  config: {name: my-app, version: 1.0.0},
  users: [:id,name,role|1,Alice,admin|2,Bob,user],
  events: [:type,x,y|click,100,200|click,150,250|:type,offset|scroll,500|:type,width,height|resize,1920,1080],
  tags: [production,api],
  metadata.nested.value: 42
}
```

Note how `events` has 3 different schemas:
- `:type,x,y` for click events
- `:type,offset` for scroll event
- `:type,width,height` for resize event

**Compact Jot (same thing, no whitespace):**
```jot
{config:{name:my-app,version:1.0.0},users:[:id,name,role|1,Alice,admin|2,Bob,user],events:[:type,x,y|click,100,200|click,150,250|:type,offset|scroll,500|:type,width,height|resize,1920,1080],tags:[production,api],metadata.nested.value:42}
```

## Arrays

**Simple arrays** (strings, numbers) — just comma-separated values:
```jot
["a","b","c"]  →  [a,b,c]
[1,2,3]        →  [1,2,3]
```

**Arrays of objects** — use table syntax with schema row:

## Table Syntax

Arrays of objects with the same keys become tables:

```
Standard array:  [{id:1,name:Alice},{id:2,name:Bob}]
Table form:      [:id,name|1,Alice|2,Bob]
```

- Schema row starts with `:` and lists field names
- Data rows follow, separated by `|`
- **Schema rows declare field names for data rows.** The field names in JSON become column names in the schema:

```jot
[{"name":"A","specs":{"x":1}},{"name":"B","variants":[1,2]}]

Schema for items with "specs":    :name,specs
Schema for items with "variants": :name,variants

→ [:name,specs|A,{x:1}|:name,variants|B,[1,2]]
```

WRONG (using "specs" when JSON says "variants"):
```jot
[:name,specs|A,{x:1}|B,[1,2]]  ✗ item B has "variants" not "specs"!
```

Tables can contain nested values:
```jot
[:id,meta,tags|1,{x:10},[a,b]|2,{y:20},[c]]
```

## Key Folding

Only fold single-key chains with primitive (non-array, non-object) values:

```
{a:{b:1}}           → {a.b:1}           ✓ fold (single key, primitive)
{a:{b:1,c:2}}       → {a:{b:1,c:2}}     ✗ don't fold (multiple keys)
{a:{b:[1,2]}}       → {a:{b:[1,2]}}     ✗ don't fold (array value)
{a:{b:{c:1}}}       → {a.b.c:1}         ✓ fold chain (still single keys)
```

## Quoting Rules

Quote strings ONLY when they:
- Parse as a number: `"123"` → `"123"` (stays quoted to preserve string type)
- Are boolean/null keywords: `"true"`, `"false"`, `"null"` → `"true"`, `"false"`, `"null"`
- Contain special characters: `: , { } [ ] " |` or leading/trailing whitespace

Otherwise, remove quotes:
```
"hello"        → hello
"my-app"       → my-app
"user@email"   → user@email
"has space"    → "has space"
"123"          → "123"
```
