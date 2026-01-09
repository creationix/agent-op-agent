# Tool Call Format Comparison

Token counts measured on Qwen3-Coder-30b.

## Recommendation

**Use positional format** for LLM tool calling.

Define tools:

```
- name(required_arg, optional?) - Description
```

Call tools:

```
<tool>name("value", opt=val)</tool>
```

Results:

```
<result>...</result>
```

## Token Efficiency

| Size | JSON Schema | Simple | Positional | Best vs JSON |
|------|------------:|-------:|-----------:|-------------:|
| Small (2 tools) | 319 | 68 | 67 | **79%** |
| Medium (6 tools) | 759 | 127 | 108 | **86%** |
| Large (13 tools) | 1696 | 249 | 188 | **89%** |

Positional is **24% better** than simple/LJSON on large toolsets.

## Why Positional Wins

1. **No key names in calls**: `read_file("/etc/hosts")` vs `read_file{path:"/etc/hosts"}`
2. **No types in schema**: `name(path, limit?)` vs `name{path:string limit?:int}`
3. **Familiar syntax**: Matches function calls in most languages
4. **14% savings per call**: Adds up over long conversations

## Format Comparison

**JSON Schema (OpenAI/MCP):**

```json
// Definition
{"type":"function","function":{"name":"search","parameters":{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer"}},"required":["query"]}}}

// Call
{"tool_calls":[{"id":"call_1","type":"function","function":{"name":"search","arguments":"{\"query\":\"TODO\",\"limit\":10}"}}]}
```

**Simple (LJSON):**

```
// Definition
- search{query:string limit?:int} - Search

// Call
<tool>search{query:"TODO" limit:10}</tool>
```

**Positional:**

```
// Definition
- search(query, limit?) - Search

// Call
<tool>search("TODO", limit=10)</tool>
```

## Spec

**Definition:** `- name(required, optional?) - Description`

**Call:** `<tool>name("positional", opt=value)</tool>`

**Response:** `<result>...</result>`

**Rules:**
- Required args are positional (order matters)
- Optional args use `name=value` syntax
- Strings are quoted, numbers/booleans are not
- No type annotations needed (models infer from context)

## Environment

- **Model**: Qwen3-Coder-30b @ 5-bit quantization
- **Date**: 2025-01-09
