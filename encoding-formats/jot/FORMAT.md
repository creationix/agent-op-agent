# Jot Format

Jot is JSON with two optimizations:

1. **Unquoted keys** — Keys can be unquoted if they are valid identifiers just like in JavaScript.
2. **Repeated objects** — When an object has the same keys as the previous object, use `{:val,val,...}` (values only, same key order).

## Example

```json
{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"},{"id":3,"name":"Charlie"}]}
```

```jot
{users:[{id:1,name:"Alice"},{:2,"Bob"},{:3,"Charlie"}]}
```

The `{:...}` means "same keys as previous object, just the values in order".
