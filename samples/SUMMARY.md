# Encoding Format Comparison

Comparison of byte size and token count (Qwen3-Coder-30b) across different serialization formats.

## Test Data

- **small**: Simple config object with 6 fields and a small array
- **medium**: User list with 3 records and metadata object
- **large**: Kubernetes-style deployment spec with nested containers, ports, resources, env vars

## Results

### Small Document

| Format        | Bytes | Tokens | Bytes/Token |
|---------------|------:|-------:|------------:|
| JSON (pretty) |   142 |     68 |        2.09 |
| JSON (mini)   |   115 |     48 |        2.40 |
| LJSON         |   103 |     45 |        2.29 |
| YAML          |   107 |     56 |        1.91 |
| TOML          |   115 |     54 |        2.13 |
| JSONito       |    90 |     45 |        2.00 |
| D2            |   120 |     53 |        2.26 |

### Medium Document

| Format        | Bytes | Tokens | Bytes/Token |
|---------------|------:|-------:|------------:|
| JSON (pretty) |   498 |    170 |        2.93 |
| JSON (mini)   |   315 |     97 |        3.25 |
| LJSON         |   275 |     92 |        2.99 |
| YAML          |   331 |    123 |        2.69 |
| TOML          |   328 |    118 |        2.78 |
| JSONito       |   224 |    103 |        2.17 |
| D2            |   267 |     99 |        2.70 |

### Large Document

| Format        | Bytes | Tokens | Bytes/Token |
|---------------|------:|-------:|------------:|
| JSON (pretty) |  1549 |    444 |        3.49 |
| JSON (mini)   |   893 |    266 |        3.36 |
| LJSON         |   781 |    265 |        2.95 |
| YAML          |  1221 |    327 |        3.73 |
| TOML          |  1263 |    377 |        3.35 |
| JSONito       |   588 |    312 |        1.88 |
| D2            |   774 |    307 |        2.52 |

## Summary Table (All Sizes)

| Format        | Small (B/T) | Medium (B/T) | Large (B/T) | Total Bytes | Total Tokens |
|---------------|------------:|-------------:|------------:|------------:|-------------:|
| JSON (pretty) |    142 / 68 |    498 / 170 |  1549 / 444 |        2189 |          682 |
| JSON (mini)   |    115 / 48 |     315 / 97 |   893 / 266 |        1323 |          411 |
| LJSON         |    103 / 45 |     275 / 92 |   781 / 265 |        1159 |          402 |
| YAML          |    107 / 56 |    331 / 123 |  1221 / 327 |        1659 |          506 |
| TOML          |    115 / 54 |    328 / 118 |  1263 / 377 |        1706 |          549 |
| JSONito       |     90 / 45 |    224 / 103 |   588 / 312 |         902 |          460 |
| D2            |    120 / 53 |     267 / 99 |   774 / 307 |        1161 |          459 |

## Key Findings

### Byte Efficiency (vs minified JSON baseline)

- **JSONito**: 32% smaller (-421 bytes) - best compression
- **D2**: 12% smaller (-162 bytes)
- **LJSON**: 12% smaller (-164 bytes)
- **YAML**: 25% larger (+336 bytes)
- **TOML**: 29% larger (+383 bytes)

### Token Efficiency (vs minified JSON baseline)

- **LJSON**: **BEST** - 402 tokens (-2% fewer)
- **JSON (mini)**: 411 tokens (baseline)
- **D2**: 12% more tokens (+48)
- **JSONito**: 12% more tokens (+49)
- **YAML**: 23% more tokens (+95)
- **TOML**: 34% more tokens (+138)

## Critical Insight

**There is a clear bytes vs tokens tradeoff.**

JSONito with deduplication achieves excellent byte compression (32% smaller than JSON), but the deduplication mechanism **hurts token efficiency**:

1. **Deduplication preamble** - Common values are written upfront (`name'cpu'memory'app'web'...`), adding tokens
2. **Pointer references** - Each `*` reference (e.g., `4*`) becomes its own token(s)
3. **Tokenizer training bias** - LLM tokenizers have efficient subword units for JSON syntax (`":`, `,"`) but not for JSONito's `'`, `~`, `*`

### Large Document Breakdown

| Format | Bytes | Tokens | Bytes/Token |
|--------|------:|-------:|------------:|
| JSON (mini) | 893 | 266 | 3.36 |
| JSONito | 588 | 312 | 1.88 |

JSONito is **34% smaller** but uses **17% more tokens** on the large document.

### Bytes vs Tokens Tradeoff

| Format   | Byte Rank | Token Rank | Notes |
|----------|-----------|------------|-------|
| JSONito  | **1st**   | 4th        | Best compression, moderate tokens |
| LJSON    | 2nd       | **1st**    | Good compression, best tokens |
| D2       | 3rd       | 3rd        | Balanced (with real encoder) |
| JSON     | 4th       | 2nd        | Larger bytes, good tokens |
| YAML     | 5th       | 5th        | Poor on both |
| TOML     | 6th       | 6th        | Worst on both |

## Recommendations

**For LLM systems**: Use **LJSON**. It's the most token-efficient format AND 12% smaller than JSON. Simple rule: "JSON, but no commas and no quotes on keys."

**For maximum compression**: Use **JSONito**. It's 32% smaller than JSON, but costs more tokens.

**For human readability**: Use **YAML**.

**Avoid D2 for LLM use**: The line-based format is a token disaster despite looking compact.

## LJSON

LJSON is a simplified JSON variant optimized for LLM token efficiency.

**Rule**: "JSON, but no commas and no quotes on keys."

**Example**:
```
{name:"Alice" age:30 active:true items:["a" "b" "c"]}
```

**Benefits**:
- 12% smaller than JSON
- 2% fewer tokens than JSON
- LLMs can generate it correctly from a one-sentence description
- Trivial to convert to/from JSON

## Model & Environment

- **Model**: Qwen3-Coder-30b @ 5-bit quantization
- **API**: LM Studio local server (localhost:1234)
- **Date**: 2025-01-09
