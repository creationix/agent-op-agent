# Jot Format

Jot is JSON optimized for tokens. It's valid JSON with these compressions:

## Syntax

**Objects:** `{key:value,key:value}`
**Arrays:** `[item,item]`
**Tables:** `[:schema|data|data]` for object arrays with repeated schemas

## Quoting Rules

Strings are unquoted unless they:

- Parse as number (`"123"`, `"1.0"`)
- Are keywords (`"true"`, `"false"`, `"null"`)
- Contain unsafe chars: `: , { } [ ] " |`
- Have leading/trailing whitespace or are empty
- Contain control characters

Keys follow the same rules, plus: quote keys containing `.` to prevent unfolding (`{"a.b":1}`).

## Key Folding

Dotted keys unfold into nested objects:

```jot
{a:{b:{c:1}}}  =>  {a.b.c:1}
{x:{a:1},y:{b:2}}  =>  {x.a:1,y.b:2}
```

For literal dots in keys, use quotes:

```jot
{"a.b":1}  =>  {"a.b":1}  (not unfolded)
```

## Tables

Object arrays with schema reuse become tables. Schema rows start with `:`, data rows follow:

```jot
[{a:1,b:2},{a:3,b:4}]  =>  [:a,b|1,2|3,4]
```

Schema changes mid-table with new `:` row:

```jot
[{a:1},{a:2},{b:3},{b:4}]  =>  [:a|1|2|:b|3|4]
```

## Examples

| JSON                        | Jot                   |
|-----------------------------|---------------------- |
| `{"name":"Alice","age":30}` | `{name:Alice,age:30}` |
| `[1,2,3]`                   | `[1,2,3]`             |
| `[{"id":1}]`                | `[{id:1}]`            |
| `{"a":{"b":{"c":1}}}`       | `{a.b.c:1}`           |
| `[{"x":1},{"x":2}]`         | `[:x\|1\|2]`          |
| `"hello world"`             | `hello world`         |
| `"123"`                     | `"123"`               |

## Decoding

1. `[...]` - array; optional `Nx` prefix ignored (for backwards compat)
2. `[:col,col|val,val|...]` - table; `:col,col` defines schema, `|` separates rows; optional `Nm` prefix ignored
3. `{key.path:value}` - unfold unquoted dotted keys into nested objects
4. `{"key.path":value}` - quoted keys are literal (dots preserved)
5. Unquoted tokens: parse as number/bool/null, else string
