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
| YAML          |   107 |     56 |        1.91 |
| TOML          |   115 |     54 |        2.13 |
| JSONito       |    89 |     44 |        2.02 |
| D2            |   123 |     59 |        2.08 |

### Medium Document

| Format        | Bytes | Tokens | Bytes/Token |
|---------------|------:|-------:|------------:|
| JSON (pretty) |   498 |    170 |        2.93 |
| JSON (mini)   |   315 |     97 |        3.25 |
| YAML          |   331 |    123 |        2.69 |
| TOML          |   328 |    118 |        2.78 |
| JSONito       |   255 |    103 |        2.48 |
| D2            |   280 |    128 |        2.19 |

### Large Document

| Format        | Bytes | Tokens | Bytes/Token |
|---------------|------:|-------:|------------:|
| JSON (pretty) |  1549 |    444 |        3.49 |
| JSON (mini)   |   893 |    266 |        3.36 |
| YAML          |  1221 |    327 |        3.73 |
| TOML          |  1263 |    377 |        3.35 |
| JSONito       |   734 |    289 |        2.54 |
| D2            |   930 |    458 |        2.03 |

## Summary Table (All Sizes)

| Format        | Small (B/T) | Medium (B/T) | Large (B/T) | Total Bytes | Total Tokens |
|---------------|------------:|-------------:|------------:|------------:|-------------:|
| JSON (pretty) |    142 / 68 |    498 / 170 |  1549 / 444 |        2189 |          682 |
| JSON (mini)   |    115 / 48 |     315 / 97 |   893 / 266 |        1323 |          411 |
| YAML          |    107 / 56 |    331 / 123 |  1221 / 327 |        1659 |          506 |
| TOML          |    115 / 54 |    328 / 118 |  1263 / 377 |        1706 |          549 |
| JSONito       |     89 / 44 |    255 / 103 |   734 / 289 |        1078 |          436 |
| D2            |    123 / 59 |    280 / 128 |   930 / 458 |        1333 |          645 |

## Key Findings

### Byte Efficiency (vs minified JSON baseline)
- **JSONito**: 19% smaller (-245 bytes)
- **D2**: -1% (roughly same)
- **YAML**: 25% larger (+336 bytes)
- **TOML**: 29% larger (+383 bytes)

### Token Efficiency (vs minified JSON baseline)
- **JSON (mini)**: **BEST** - 411 tokens (baseline)
- **JSONito**: 6% more tokens (+25)
- **YAML**: 23% more tokens (+95)
- **TOML**: 34% more tokens (+138)
- **D2**: 57% more tokens (+234)

## Critical Insight

**Minified JSON is the most token-efficient format for Qwen3-Coder-30b.**

This is counterintuitive but explainable:

1. **LLM tokenizers are trained on JSON** - Models see massive amounts of JSON in training data, so tokenizers have efficient subword units for JSON syntax (`":`, `,"`, `":{"`, etc.)

2. **Custom formats tokenize poorly** - JSONito's unusual delimiters (`'`, `~`, `.`) don't match common subword patterns, so they often become individual tokens.

3. **D2's line-based format is worst** - Each newline creates token boundaries, and short lines (like `"TCP"`) waste tokens on the overhead.

4. **YAML/TOML whitespace costs tokens** - Indentation and newlines consume tokens without carrying data.

### Bytes vs Tokens Tradeoff

| Format   | Byte Rank | Token Rank | Notes |
|----------|-----------|------------|-------|
| JSONito  | 1st       | 2nd        | Best compression, decent tokens |
| JSON     | 4th       | **1st**    | Worst bytes, best tokens |
| D2       | 2nd       | 5th        | Good bytes, terrible tokens |
| YAML     | 3rd       | 3rd        | Balanced |
| TOML     | 5th       | 4th        | Poor on both |

## Recommendations

**For LLM context optimization**: Use **minified JSON**. Despite being larger in bytes, it uses fewer tokens because tokenizers are optimized for it.

**For storage/network optimization**: Use **JSONito**. It's 19% smaller than minified JSON.

**For human readability + reasonable efficiency**: Use **YAML**.

**Avoid D2 for LLM use**: The line-based format is a token disaster despite looking compact.

## Model & Environment

- **Model**: Qwen3-Coder-30b @ 5-bit quantization
- **API**: LM Studio local server (localhost:1234)
- **Date**: 2025-01-09
