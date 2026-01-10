# Jot Format

Jot is JSON with three modifications:

1. **Minimal quoting** — Strings don't need quotes unless ambiguous
2. **Key folding** — Single-key object chains collapse: `{"a":{"b":1}}` → `{a.b:1}`
3. **Tables** — Arrays where ALL objects have identical keys use `(schema|row|row)` syntax

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
    {"type": "click", "x": 100},
    {"type": "scroll", "offset": 500}
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
  users: (id,name,role|1,Alice,admin|2,Bob,user),
  events: [{type:click,x:100},{type:scroll,offset:500}],
  tags: [production,api],
  metadata.nested.value: 42
}
```

Note:
- `users` becomes a table with `()` (all objects have same keys: id, name, role)
- `events` stays as array `[]` (objects have different keys)
- `tags` is a simple array `[]`

## Arrays vs Tables

**Arrays use brackets `[]`:**
```jot
[a,b,c]                    simple array
[{x:1},{y:2}]              objects with different keys
```

**Tables use parentheses `()` — like CSV with `|` instead of newlines:**
```jot
(id,name|1,Alice|2,Bob)    objects with SAME keys
```

This is equivalent to:
```csv
id,name
1,Alice
2,Bob
```

Only use `()` tables when ALL objects have the exact same keys.

Table cells can contain nested values:
```jot
(id,meta,tags|1,{x:10},[a,b]|2,{y:20},[c])
```

## Key Folding

Only fold when the nested object has exactly ONE key:

```
{a:{b:1}}           → {a.b:1}           ✓ fold (one key)
{a:{b:1,c:2}}       → {a:{b:1,c:2}}     ✗ DON'T fold (two keys!)
{a:{b:[1,2]}}       → {a:{b:[1,2]}}     ✗ don't fold (array value)
{user:{login:x,id:1}} → {user:{login:x,id:1}}  ✗ DON'T fold into user.login + user.id
```

## Quoting Rules

**Quote strings that contain ANY of these:** `: , { } [ ] ( ) " |` or whitespace

```
"hello"                    → hello
"my-app"                   → my-app
"has space"                → "has space"    (contains space)
"a, b, c"                  → "a, b, c"      (contains comma)
"key: value"               → "key: value"   (contains colon)
"123"                      → "123"          (looks like number)
```

**Important:** If unsure, keep the quotes. Unquoted strings with special characters will break parsing.
