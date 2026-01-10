# Jot Format

Jot is JSON with some optimizations:

1. **Unquoted keys** — Object and table keys don't need quotes unless they contain special characters or dots.
2. **Tables** — When an array contains all arrays with identical keys, it can be written as a table similar to CSV `{{col1,col2;val1,val2;val3,val4}}`.

## Complete Example

```json
{
  "config": {
    "name": "my-app",
    "version": "1.0.0"
  },
  "users": [
    {"id": 1, "name": "Alice", "role": "admin"},
    {"id": 2, "name": "Bob", "role": "user"},
    {"id": 3, "name": "Charlie", "role": null}
  ],
  "tags": ["production", "api"]
}
```

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
    3,"Charlie",null
  }},
  tags: ["production", "api"],
}
```

And here is the same example without whitespace for compactness:

```json
{"config":{"name": "my-app","version": "1.0.0"},"users":[{"id":1,"name":"Alice","role":"admin"},{"id":2,"name":"Bob","role":"user"},{"id":3,"name":"Charlie","role":null}],"tags":["production","api"]}
```

```jot
{config:{name:"my-app",version:"1.0.0"},users:{{id,name,role;1,"Alice","admin";2,"Bob","user";3,"Charlie",null}},tags:["production","api"]}
```

In general you should use the compact format for storage and transmission, and the pretty format for human readability.
