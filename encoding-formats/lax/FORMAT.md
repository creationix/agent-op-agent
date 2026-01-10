# Lax Format

Lax is relaxed JSON syntax optimized for readability and simpler tokenization.

## Syntax

**Objects:** `{key:value key:value}`
**Arrays:** `[item item item]`

## Key Differences from JSON

1. **No commas** - Items separated by whitespace instead
2. **Unquoted keys** - Object keys never need quotes
3. **Quoted strings** - All string values require quotes

## Quoting Rules

**Keys:** NEVER quoted. Keys are bare identifiers that can contain letters, numbers, hyphens, underscores, etc. Only `:`, `{`, `}`, `[`, `]`, and whitespace end a key.

```lax
{react-dom:"^18.2.0"}     ✓ correct (hyphen in key is fine)
{"react-dom":"^18.2.0"}   ✗ wrong (never quote keys)
```

**Values:**

- Strings: Always quoted (`"hello"`, `"hello world"`)
- Numbers: Unquoted (`42`, `3.14`, `-17`)
- Booleans: Unquoted (`true`, `false`)
- Null: Unquoted (`null`)

## Examples

| JSON                              | Lax                               |
|-----------------------------------|-----------------------------------|
| `{"name":"Alice","age":30}`       | `{name:"Alice" age:30}`           |
| `[1,2,3]`                         | `[1 2 3]`                         |
| `["a","b","c"]`                   | `["a" "b" "c"]`                   |
| `{"a":{"b":1}}`                   | `{a:{b:1}}`                       |
| `[{"id":1},{"id":2}]`             | `[{id:1} {id:2}]`                 |
| `{"enabled":true,"count":null}`   | `{enabled:true count:null}`       |

## Encoding

```
object   → { key:value key:value ... }
array    → [ value value value ... ]
string   → "..." (with JSON escape sequences)
number   → same as JSON
boolean  → true | false
null     → null
```

## Decoding

1. `{...}` - object with space-separated key:value pairs
2. `[...]` - array with space-separated values
3. `"..."` - quoted string (JSON escape rules)
4. Unquoted tokens: parse as number/bool/null
