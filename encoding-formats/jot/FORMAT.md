# Jot Format

## RULE #1: ALWAYS USE COLON BETWEEN KEY AND VALUE

Every key:value pair needs a colon. The value can be anything - string, number, array, table.

CORRECT: `{points:[:t,v|1,2]}`  (colon between "points" and "[")
WRONG:   `{points[:t,v|1,2]}`   (NO! Missing colon!)

## Syntax

**Objects:** `{key:value,key:value}` - ALWAYS colon between key and value
**Arrays:** `[item,item]`
**Tables:** `[:schema|data|data]` for object arrays

When a key's value is a table, you MUST have colon before the table:

- `{data:[:a,b|1,2]}` is correct
- `{data[:a,b|1,2]}` is WRONG

## Quoting Rules

Strings are unquoted unless they:

- Parse as number (`"123"`, `"1.0"`)
- Are keywords (`"true"`, `"false"`, `"null"`)
- Contain unsafe chars: `: , { } [ ] " |`
- Have leading/trailing whitespace or are empty
- Contain control characters

Keys follow the same rules, plus: quote keys containing `.` to prevent unfolding (`{"a.b":1}`).

## Key Folding

Key folding ONLY applies to chains of single-key objects ending in a primitive value:

```jot
{a:{b:{c:1}}}  =>  {a.b.c:1}
{x:{a:1},y:{b:2}}  =>  {x.a:1,y.b:2}
```

**DO NOT fold** when:

- Value is an array: `{users:[...]}` stays as `{users:[...]}`
- Value is a table: `{users:[:id|1|2]}` stays as `{users:[:id|1|2]}`
- Object has multiple keys: `{a:{x:1,y:2}}` stays as `{a:{x:1,y:2}}`

```jot
{data:[1,2,3]}        =>  {data:[1,2,3]}       (array - NO fold)
{users:[:id|1|2]}     =>  {users:[:id|1|2]}    (table - NO fold)
{obj:{a:1,b:2}}       =>  {obj:{a:1,b:2}}      (multi-key - NO fold)
{deep:{x:{y:1}}}      =>  {deep.x.y:1}         (single-key chain - fold OK)
```

**Key rule:** Only use `.` when ALL intermediate objects have exactly ONE key AND the final value is a primitive (not array/table).

For literal dots in keys, use quotes:

```jot
{"a.b":1}  =>  {"a.b":1}  (not unfolded)
```

## Tables

Object arrays with schema reuse become tables. Schema rows start with `:`, data rows follow:

```jot
[{a:1,b:2},{a:3,b:4}]  =>  [:a,b|1,2|3,4]
```

**Schema changes:** When objects have different fields, output a new `:schema` row:

```jot
[{a:1},{a:2},{b:3},{b:4}]  =>  [:a|1|2|:b|3|4]
```

**Irregular arrays** (each object has different fields): Use a new schema for each change:

```jot
[{"type":"click","x":100},{"type":"scroll","offset":50}]
=>
[:type,x|click,100|:type,offset|scroll,50]
```

Each time the set of fields changes, output `:field1,field2,...` before the data row.

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

### Complete Example

JSON input:

```json
{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}],"meta":{"count":2}}
```

Jot output:

```jot
{users:[:id,name|1,Alice|2,Bob],meta:{count:2}}
```

Note: The outer `{...}` wraps the whole object. `users:` has a table value, `meta:` has an object value.

## Decoding

1. `[...]` - array
2. `[:col,col|val,val|...]` - table; `:col,col` defines schema, `|` separates rows
3. `{key.path:value}` - unfold unquoted dotted keys into nested objects
4. `{"key.path":value}` - quoted keys are literal (dots preserved)
5. Unquoted tokens: parse as number/bool/null, else string
