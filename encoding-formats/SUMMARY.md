# Encoding Format Comparison

Token counts measured on Qwen3-Coder-30b. For LLM systems, **tokens matter more than bytes**.

## Recommendation

**Use Jot** for minimal tokens — combines minimal quoting, key folding, and table syntax.

## Token Efficiency

| Format                                              | Tokens | vs JSON  | Bytes |
|-----------------------------------------------------|-------:|---------:|------:|
| **[Jot](jot/)**                                     |    467 |     -18% | 1,224 |
| [Jot-safe](jot-safe/)                               |    487 |     -14% | 1,240 |
| [Lax](lax/)                                         |    546 |      -4% | 1,559 |
| [TOON](toon/)                                       |    563 |      -1% | 1,599 |
| [JSON](https://www.json.org/) (mini)                |    569 | baseline | 1,775 |
| [JSONito](https://github.com/creationix/jsonito)    |    618 |      +9% | 1,206 |
| [D2](https://github.com/creationix/d2)              |    648 |     +14% | 1,525 |
| [YAML](https://yaml.org/)                           |    693 |     +22% | 2,139 |
| [TOML](https://toml.io/)                            |    740 |     +30% | 2,178 |

## Format Descriptions

### Jot

Minimal quoting + key folding + table syntax. **-18% vs JSON**.

```
{name:Alice,users:[id,email|1,a@ex.com|2,b@ex.com]}
```

Features:

- **Minimal quoting**: Only quote strings that parse as numbers, contain unsafe chars (`: , { } [ ] ( ) " |`), equal reserved words, or have whitespace/control chars
- **Key folding**: `{a:{b:{c:1}}}` → `(a.b.c:1)`
- **Tables**: `[{a:1},{a:2}]` → `[a|1|2]`

### Jot-safe

Jot with count guards for truncation detection. **-14% vs JSON**.

```
{name:Alice,users:2r[id,email|1,a@ex.com|2,b@ex.com],tags:3x[a,b,c]}
```

Guards:

- `Nx[...]` for arrays (N = element count)
- `Nr[...]` for tables (N = row count)

### Lax

Relaxed JSON: no commas, no key quotes. **-4% vs JSON**.

```
{name:"Alice" age:30 items:["a" "b" "c"]}
```

### TOON

YAML-like with count guards and table syntax. **-1% vs JSON**.

```yaml
users[2]{id,name}:
  1,Alice
  2,Bob
```

## Full Results

| Format      | Small | Medium | Large | Hikes | Total |
|-------------|------:|-------:|------:|------:|------:|
| **Jot**     |    44 |     69 |   244 |   110 |   467 |
| Jot-safe    |    47 |     71 |   254 |   115 |   487 |
| Lax         |    45 |     92 |   265 |   144 |   546 |
| TOON        |    50 |     83 |   308 |   122 |   563 |
| JSON (mini) |    48 |     97 |   266 |   158 |   569 |
| JSONito     |    45 |    103 |   312 |   158 |   618 |
| D2          |    55 |    104 |   316 |   173 |   648 |
| YAML        |    56 |    123 |   327 |   187 |   693 |
| TOML        |    56 |    118 |   377 |   189 |   740 |

### Test Data

- **small**: Config object (6 fields, small array)
- **medium**: User list (3 records + metadata)
- **large**: Kubernetes deployment spec
- **hikes**: TOON example (3 hike records)

## Why Not Byte-Optimized Formats?

Formats like JSONito achieve excellent byte compression but **cost more tokens** due to:

- Deduplication preambles and pointer references
- Tokenizer bias toward JSON syntax

Also, LLMs cannot reliably generate complex formats requiring state tracking.

## Environment

- **Model**: Qwen3-Coder-30b @ 5-bit quantization
- **API**: LM Studio localhost:1234
- **Date**: 2026-01-09
