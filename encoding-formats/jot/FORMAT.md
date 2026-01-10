# Jot Format

Jot is JSON with three modifications:

1. **Unquoted keys** — Object keys don't need quotes
2. **Key folding** — Single-key object chains collapse: `{a:{b:1}}` → `{a.b:1}`
3. **Tables** — Arrays where ALL objects have identical keys use `(k1,k2|v1,v2|v3,v4)` syntax

Everything else is exactly like JSON.

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
  config: {
    name: "my-app",
    version: "1.0.0"
  },
  users: (
    id,name,role|
    1,"Alice","admin"|
    2,"Bob","user"
 ),
  tags: ["production", "api"],
  metadata.nested.value: 42
}
```

## Key Folding

Fold when the nested object has exactly ONE key:

```
{"a":{"b":1}}                 → {a.b:1}                  ✓ fold
{"a":{"b":[1,2]}}             → {a.b:[1,2]}              ✓ fold
{"a":{"b":1,"c":2}}           → {a:{b:1,c:2}}            ✗ DON'T fold (two keys)
{"user":{"login":"x","id":1}} → {user:{login:"x",id:1}}  ✗ DON'T fold (two keys)
{"a":{"b":{"c":2}}}           → {a.b.c:2}                ✓ fold
```

## Tables

Use `(columns|row|row|...)` when ALL objects have the same keys (like CSV, but with `|` as row separator and Jot encoded values):

```json
[
  {"id":1,"name":"Alice"},
  {"id":2,"name":"Bob"}
]
```

becomes:

```jot
(
  id,name |
  1,"Alice" |
  2,"Bob"
)
```

Or more compactly:

```jot
(id,name|1,"Alice"|2,"Bob")
```

If objects have different keys, keep as regular array:

```json
[{"a":1},{"b":2}]
```

becomes

```jot
[{a:1},{b:2}]
```

## Summary

- Arrays of tables use new CSV inspired `(cols|row|row)` syntax
- objects don't need to quote keys
- Nested single-key objects fold into dot notation
- Everything else is identical to JSON
