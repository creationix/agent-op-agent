# Encoding Format Comparison

Token counts measured on Qwen3-Coder-30b. For LLM systems, **tokens matter more than bytes**.

## Recommendation

**Use LJSON v2** for minimal tokens with uniform array optimization.

### LJSON v2

Rule: "JSON, but no commas, no quotes on keys, and uniform arrays use `[keys|{vals}...]` header syntax."

```
{name:"Alice" age:30 users:[id name|{1 "Alice"}{2 "Bob"}]}
```

The header syntax avoids repeating keys in arrays of same-schema objects (-7% vs LJSON).

### NQJSON

Rule: "JSON, but no quotes unless needed."

```
{name:Alice,age:30,items:[a,b,c]}
```

Simplest rule set. Quote only when value contains comma or needs forced string type.

### LJSON (simple)

Rule: "JSON, but no commas and no quotes on keys."

```
{name:"Alice" age:30 items:["a" "b" "c"]}
```

### LJSON-safe

Rule: "JSON, but no commas, no quotes on keys, and `n|` count prefix on arrays and objects."

```
{3|name:"Alice" age:30 items:[3|"a" "b" "c"]}
```

The count prefix enables truncation detection and validation (+18% tokens vs LJSON).

## Token Efficiency (Total across all test documents)

| Format        | Tokens | vs JSON |
|---------------|-------:|--------:|
| **LJSON v2**  |    373 |     -9% |
| NQJSON        |    388 |     -6% |
| LJSON         |    402 |     -2% |
| JSON (mini)   |    411 | baseline|
| TOON          |    459 |    +12% |
| D2            |    459 |    +12% |
| JSONito       |    460 |    +12% |
| LJSON-safe    |    475 |    +16% |
| YAML          |    506 |    +23% |
| TOML          |    549 |    +34% |

## Why Not Byte-Optimized Formats?

Formats like JSONito achieve excellent byte compression (32% smaller than JSON) but **cost more tokens** due to:

- Deduplication preambles and pointer references
- Tokenizer bias toward JSON syntax (trained on web data)

For LLMs, token count is the bottleneck—not bytes.

Also, LLMs cannot generate these formats reliably as they are too complex and require too much state tracking.

## Full Results

### By Document Size

| Format        | Small | Medium | Large | Total |
|---------------|------:|-------:|------:|------:|
| **LJSON v2**  |    45 |     78 |   250 |   373 |
| NQJSON        |    44 |     86 |   258 |   388 |
| LJSON         |    45 |     92 |   265 |   402 |
| JSON (mini)   |    48 |     97 |   266 |   411 |
| TOON          |    51 |     84 |   324 |   459 |
| D2            |    53 |     99 |   307 |   459 |
| JSONito       |    45 |    103 |   312 |   460 |
| LJSON-safe    |    50 |    104 |   321 |   475 |
| YAML          |    56 |    123 |   327 |   506 |
| TOML          |    54 |    118 |   377 |   549 |

**Note**: LJSON v2's header syntax beats TOON on uniform arrays (medium: 78 vs 84) while maintaining LJSON's advantage on nested structures (large: 250 vs 324).

### Test Data

- **small**: Config object (6 fields, small array)
- **medium**: User list (3 records + metadata)
- **large**: Kubernetes deployment spec (nested containers, ports, env vars)

## Environment

- **Model**: Qwen3-Coder-30b @ 5-bit quantization
- **API**: LM Studio localhost:1234
- **Date**: 2025-01-09
