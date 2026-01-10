# TOON Format

TOON (Token-Oriented Object Notation) is a compact encoding combining YAML-style indentation with CSV-style tables for arrays.

## Syntax

**Key-value pairs:** `key: value`
**Nested objects:** Indentation-based (like YAML)
**Simple arrays:** `key[N]: val1,val2,val3`
**Object arrays (tables):** `key[N]{col1,col2}: \n  val1,val2 \n  val1,val2`

## Core Features

### Indentation for Objects

Nested objects use indentation instead of braces:

```toon
metadata:
  total: 3
  page: 1
```

Equivalent JSON: `{"metadata":{"total":3,"page":1}}`

### Tables for Uniform Arrays

Arrays of objects with the same schema become tables:

```toon
users[3]{id,name,role}:
  1,Alice,admin
  2,Bob,user
  3,Carol,viewer
```

- `[3]` declares array length (for validation)
- `{id,name,role}` declares field names once
- Each indented line is a row of comma-separated values

Equivalent JSON:
```json
{"users":[{"id":1,"name":"Alice","role":"admin"},{"id":2,"name":"Bob","role":"user"},{"id":3,"name":"Carol","role":"viewer"}]}
```

### Primitive Arrays

Simple arrays use inline comma-separated format:

```toon
tags[3]: production,api,v1
```

Equivalent JSON: `{"tags":["production","api","v1"]}`

## Quoting Rules

**Keys:** Quote only when containing special characters (`"react-dom": ^18.2.0`)

**Values:** Minimal quoting. Quote strings only when they:
- Contain delimiters (`,`, `:`, newline)
- Have leading/trailing whitespace
- Could be ambiguous with other types

## Data Types

- **Strings:** Unquoted when unambiguous, quoted otherwise
- **Numbers:** `42`, `3.14`, `-17`
- **Booleans:** `true`, `false`
- **Null:** `null`

## Examples

| JSON                                    | TOON                          |
|-----------------------------------------|-------------------------------|
| `{"name":"config","version":"1.0.0"}`   | `name: config`<br>`version: 1.0.0` |
| `{"a":{"b":1}}`                         | `a:`<br>`  b: 1`              |
| `{"tags":["a","b"]}`                    | `tags[2]: a,b`                |
| `[{"x":1},{"x":2}]`                     | `[2]{x}:`<br>`  1`<br>`  2`   |

## Decoding

1. Lines with `:` are key-value pairs
2. `key[N]{fields}:` starts a table - N rows follow with fields as columns
3. `key[N]:` followed by comma-separated values is a primitive array
4. Increased indentation indicates nesting
5. Unquoted values: parse as number/bool/null, else string

## Reference

Full specification: [toonformat.dev](https://toonformat.dev)
