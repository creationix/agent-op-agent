# Jot Format

Jot is JSON with three modifications:

1. **Unquoted keys** — Object and table keys don't need quotes unless they contain special characters or dots.
2. **Key folding** — Single-key object chains collapse: `{a:{b:1}}` → `{a.b:1}`
3. **Tables** — When an array contains all arrays with similar keys, it can be written as a table similar to CSV `{{col1,col2;val1,val2;val3,val4}}`.  Unused values are left blank so that slight differences in row schemas are tolerated.

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
    {"id": 2, "name": "Bob", "role": "user"},
    {"id": 3, "name": "Charlie"}
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
  users: {{
    id,name,role;
    1,"Alice","admin";
    2,"Bob","user";
    3,"Charlie",
  }},
  tags: ["production", "api"],
  metadata.nested.value: 42
}
```

And here is the same example without whitespace for compactness:

```json
{"config":{"name": "my-app","version": "1.0.0"},"users":[{"id":1,"name":"Alice","role":"admin"},{"id":2,"name":"Bob","role":"user"},{"id":3,"name":"Charlie"}],"tags":["production","api"],"metadata":{"nested":{"value":42}}}
```

```jot
{config:{name:"my-app",version:"1.0.0"},users:{{id,name,role;1,"Alice","admin";2,"Bob","user";3,"Charlie",}},tags:["production","api"],metadata.nested.value:42}
```

In general you should use the compact format for storage and transmission, and the pretty format for human readability.
