# Jot Format

Jot is JSON with three optimizations:

1. **Unquoted strings** — Strings don't need quotes unless they contain special characters (`: ; , { } [ ] "`) or are reserved words
2. **Key folding** — Single-key nested objects collapse: `{a:{b:1}}` → `{a.b:1}`
   if normal keys contain dots, keep quotes: `{"a.b":1}`
3. **Tables** — Object arrays with repeating schemas use `{{:cols;row;row}}` syntax

## Unquoted Strings

Strings can omit quotes unless they:

- Contain special chars: `: ; , { } [ ] "`
- Are empty or have leading/trailing whitespace
- Parse as a number, boolean, or null

Keys additionally need quotes if they contain `.` (to distinguish from folded keys).

```json
{"name":"Alice","city":"New York","count":"42"}
```

```jot
{name:Alice,city:"New York",count:"42"}
```

## Key Folding

When a nested object has exactly ONE key, fold it:

```json
{"server":{"host":"localhost"}}
```

```jot
{server.host:localhost}
```

DON'T fold if nested object has multiple keys:

```json
{"server":{"host":"localhost","port":8080}}
```

```jot
{server:{host:localhost,port:8080}}
```

## Tables

Object arrays use `{{:schema;row;row;...}}` when schemas repeat. Start with `:` followed by column names:

Don't use tables when there's no schema reuse (each object unique) — regular arrays are more compact.

```json
[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]
```

```jot
{{:id,name;1,Alice;2,Bob}}
```

To change schema mid-table, add another `:schema;` row:

```json
[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"},{"x":10,"y":20}]
```

```jot
{{:id,name;1,Alice;2,Bob;:x,y;10,20}}
```
