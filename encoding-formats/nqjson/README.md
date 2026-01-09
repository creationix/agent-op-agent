# NQJSON

**No-Quote JSON** - JSON with minimal quoting.

## Rule

"JSON, but no quotes unless needed."

## Generation Rules

Keys: never quoted.

String values: quote **only if**:
1. Parses as a number (`"123"`, `"1.0"` — not `api5`, `v2`)
2. Contains unsafe chars: `: , { } [ ] ( ) "`
3. Equals `true`, `false`, or `null`
4. Contains control characters (newlines, tabs, etc.)

## Examples

```
JSON:    {"name":"config","version":"1.0","api":"api5","mode":"production"}
NQJSON:  {name:config,version:"1.0",api:api5,mode:production}
```

```
JSON:    {"image":"nginx:1.21","port":"8080","tag":"v2"}
NQJSON:  {image:"nginx:1.21",port:"8080",tag:v2}
```

## LLM Prompt

```
Convert to NQJSON (compact, no spaces):

NQJSON rules:
1. Keys: never quoted
2. String values - QUOTE only if:
   - Parses as a number ("123", "1.0" - not "api5" or "v2")
   - Contains : , { } [ ] ( ) "
   - Equals true/false/null

Example: {host:localhost,port:"443",image:"nginx:1.21",tag:v2}
```
