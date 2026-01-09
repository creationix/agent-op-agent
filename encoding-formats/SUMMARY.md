# Encoding Format Comparison

Token counts measured on Qwen3-Coder-30b. For LLM systems, **tokens matter more than bytes**.

## Recommendation

**Use LJSON** for LLM systems. Rule: "JSON, but no commas and no quotes on keys."

```ljson
{name:"Alice" age:30 active:true items:["a" "b" "c"]}
```

- 2% fewer tokens than JSON
- 12% smaller than JSON
- LLMs can generate it from a one-sentence description
- Trivial to convert to/from JSON

## Token Efficiency (Total across all test documents)

| Format        | Tokens | vs JSON |
|---------------|-------:|--------:|
| **LJSON**     |    402 |     -2% |
| JSON (mini)   |    411 | baseline|
| TOON          |    459 |    +12% |
| D2            |    459 |    +12% |
| JSONito       |    460 |    +12% |
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
| LJSON         |    45 |     92 |   265 |   402 |
| JSON (mini)   |    48 |     97 |   266 |   411 |
| TOON          |    51 |     84 |   324 |   459 |
| D2            |    53 |     99 |   307 |   459 |
| JSONito       |    45 |    103 |   312 |   460 |
| YAML          |    56 |    123 |   327 |   506 |
| TOML          |    54 |    118 |   377 |   549 |

**Note**: TOON excels at uniform arrays (medium: 84 tokens, beats LJSON's 92), but loses on nested structures (large: 324 vs LJSON's 265).

### Test Data

- **small**: Config object (6 fields, small array)
- **medium**: User list (3 records + metadata)
- **large**: Kubernetes deployment spec (nested containers, ports, env vars)

## Environment

- **Model**: Qwen3-Coder-30b @ 5-bit quantization
- **API**: LM Studio localhost:1234
- **Date**: 2025-01-09
