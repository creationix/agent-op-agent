# Encoding Format Comparison

Token counts measured on Qwen3-Coder-30b. For LLM systems, **tokens matter more than bytes**.

## Recommendation

**Use NQJSON2** for minimal tokens — combines minimal quoting with uniform array headers.

### NQJSON2

Rule: "NQJSON with uniform arrays using `[keys|vals|vals|...]` header syntax."

```
{name:config,users:[id,name,email|1,Alice,a@ex.com|2,Bob,b@ex.com]}
```

Combines NQJSON's minimal quoting with CSV-style uniform arrays. Best overall: **-19% vs JSON**.

### NQJSON2-safe

Rule: "NQJSON2 with `n|` count prefix on arrays (like TOON)."

```
{name:config,users:[3|id,name|1,Alice|2,Bob|3,Carol]}
```

For uniform arrays, count is the number of rows. **-16% vs JSON** (vs TOON's +2%).

### LJSON v2

Rule: "JSON, but no commas, no quotes on keys, and uniform arrays use `[keys|{vals}...]` header syntax."

```
{name:"Alice" age:30 users:[id name|{1 "Alice"}{2 "Bob"}]}
```

The header syntax avoids repeating keys in arrays of same-schema objects (-14% vs JSON).

### NQJSON

Rule: "JSON, but no quotes unless needed."

```
{name:config,version:"1.0",api:api5,items:[a,b,c]}
```

**Generation rules** - quote string values only if:
1. Parses as a number (`"123"`, `"1.0"` — not `api5`, `v2`)
2. Contains unsafe chars: `: , { } [ ] ( ) "`
3. Equals `true`, `false`, or `null`
4. Contains control characters (newlines, tabs, etc.)

### NQJSON-safe

Rule: "NQJSON with `n|` count prefix on arrays (like TOON)."

```
{name:config,version:"1.0",items:[3|a,b,c]}
```

The count prefix enables truncation detection (+3% tokens vs NQJSON).

### LJSON (simple)

Rule: "JSON, but no commas and no quotes on keys."

```
{name:"Alice" age:30 items:["a" "b" "c"]}
```

### LJSON-safe

Rule: "LJSON with `n|` count prefix on arrays (like TOON)."

```
{name:"Alice" age:30 items:[3|"a" "b" "c"]}
```

The count prefix enables truncation detection (+3% tokens vs LJSON).

## Token Efficiency (Total across all test documents)

| Format        | Tokens | vs JSON |
|---------------|-------:|--------:|
| **NQJSON2**   |    463 |    -19% |
| NQJSON2-safe  |    479 |    -16% |
| LJSON v2      |    491 |    -14% |
| NQJSON        |    536 |     -6% |
| LJSON         |    546 |     -4% |
| NQJSON-safe   |    552 |     -3% |
| LJSON-safe    |    562 |     -1% |
| JSON (mini)   |    569 | baseline|
| TOON          |    583 |     +2% |
| JSONito       |    618 |     +9% |
| D2            |    632 |    +11% |
| YAML          |    693 |    +22% |
| TOML          |    738 |    +30% |

## Why Not Byte-Optimized Formats?

Formats like JSONito achieve excellent byte compression (32% smaller than JSON) but **cost more tokens** due to:

- Deduplication preambles and pointer references
- Tokenizer bias toward JSON syntax (trained on web data)

For LLMs, token count is the bottleneck—not bytes.

Also, LLMs cannot generate these formats reliably as they are too complex and require too much state tracking.

## Full Results

### By Document Size

| Format        | Small | Medium | Large | Hikes | Total |
|---------------|------:|-------:|------:|------:|------:|
| **NQJSON2**   |    44 |     69 |   240 |   110 |   463 |
| NQJSON2-safe  |    46 |     71 |   248 |   114 |   479 |
| LJSON v2      |    45 |     78 |   250 |   118 |   491 |
| NQJSON        |    44 |     86 |   259 |   147 |   536 |
| LJSON         |    45 |     92 |   265 |   144 |   546 |
| NQJSON-safe   |    46 |     88 |   267 |   151 |   552 |
| LJSON-safe    |    47 |     94 |   273 |   148 |   562 |
| JSON (mini)   |    48 |     97 |   266 |   158 |   569 |
| TOON          |    51 |     84 |   324 |   124 |   583 |
| JSONito       |    45 |    103 |   312 |   158 |   618 |
| D2            |    53 |     99 |   307 |   173 |   632 |
| YAML          |    56 |    123 |   327 |   187 |   693 |
| TOML          |    54 |    118 |   377 |   189 |   738 |

**Note**: NQJSON2 dominates across all documents — hikes: 110 (-30% vs JSON), large: 240, medium: 69. Combines minimal quoting with CSV-style uniform arrays.

### Test Data

- **small**: Config object (6 fields, small array)
- **medium**: User list (3 records + metadata)
- **large**: Kubernetes deployment spec (nested containers, ports, env vars)
- **hikes**: TOON example document (context object, friends array, 3 hike records)

## Environment

- **Model**: Qwen3-Coder-30b @ 5-bit quantization
- **API**: LM Studio localhost:1234
- **Date**: 2025-01-09
