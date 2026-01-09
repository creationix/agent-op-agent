# Encoding Format Comparison

Token counts measured on Qwen3-Coder-30b. For LLM systems, **tokens matter more than bytes**.

## Recommendation

**Use Jot** for minimal tokens — combines minimal quoting, key folding, and table syntax.

## Token Efficiency

| Format                                              | Tokens | vs JSON  | Bytes |
|-----------------------------------------------------|-------:|---------:|------:|
| **[Jot](jot/)**                                     |    857 |     -16% | 2,134 |
| [Jot-safe](jot-safe/)                               |    886 |     -13% | 2,158 |
| [Lax](lax/)                                         |    994 |      -2% | 2,596 |
| [JSON](https://www.json.org/) (mini)                |  1,015 | baseline | 2,929 |
| [TOON](toon/)                                       |  1,023 |      +1% | 2,612 |
| [JSONito](https://github.com/creationix/jsonito)    |  1,042 |      +3% | 2,171 |
| [D2](https://github.com/creationix/d2)              |  1,134 |     +12% | 2,660 |
| [YAML](https://yaml.org/)                           |  1,204 |     +19% | 3,277 |
| [TOML](https://toml.io/)                            |  1,252 |     +23% | 3,416 |

## Format Descriptions

### Jot

Minimal quoting + key folding + table syntax. **-16% vs JSON**.

```
{name:Alice,users:[id,email|1,a@ex.com|2,b@ex.com]}
```

Features:

- **Minimal quoting**: Only quote strings that parse as numbers, contain unsafe chars (`: , { } [ ] ( ) " |`), equal reserved words, or have whitespace/control chars
- **Key folding**: `{a:{b:{c:1}}}` → `(a.b.c:1)`
- **Tables**: `[{a:1},{a:2}]` → `[a|1|2]`

### Jot-safe

Jot with count guards for truncation detection. **-13% vs JSON**.

```
{name:Alice,users:2r[id,email|1,a@ex.com|2,b@ex.com],tags:3x[a,b,c]}
```

Guards:

- `Nx[...]` for arrays (N = element count)
- `Nr[...]` for tables (N = row count)

### Lax

Relaxed JSON: no commas, no key quotes. **-2% vs JSON**.

```
{name:"Alice" age:30 items:["a" "b" "c"]}
```

### TOON

YAML-like with count guards and table syntax. **+1% vs JSON**.

```yaml
users[2]{id,name}:
  1,Alice
  2,Bob
```

## Full Results

| Format      | Small | Medium | Large | Hikes | Chat | Metrics | Package | Issue | Irregular |
|-------------|------:|-------:|------:|------:|-----:|--------:|--------:|------:|----------:|
| **Jot**     |    44 |     69 |   244 |   110 |   66 |      99 |      85 |    77 |        63 |
| Jot-safe    |    47 |     71 |   254 |   115 |   69 |     101 |      85 |    79 |        65 |
| Lax         |    45 |     92 |   265 |   144 |   79 |     117 |      95 |    88 |        69 |
| JSON (mini) |    48 |     97 |   266 |   158 |   76 |     117 |      97 |    88 |        68 |
| TOON        |    50 |     83 |   308 |   122 |   68 |     110 |     104 |    90 |        88 |
| JSONito     |    45 |    103 |   312 |   158 |   86 |      89 |     101 |    89 |        59 |
| D2          |    55 |    104 |   316 |   173 |   80 |     138 |      90 |    97 |        81 |
| YAML        |    56 |    123 |   327 |   187 |   82 |     140 |     104 |    98 |        87 |
| TOML        |    56 |    118 |   377 |   189 |   84 |     139 |     104 |    99 |        86 |

### Test Data

- **small**: Config object (6 fields, 3-item array)
- **medium**: User list (3 records + metadata)
- **large**: Kubernetes deployment spec (nested config)
- **hikes**: Tabular records (3 hikes with uniform schema)
- **chat**: LLM conversation (3 messages, text-heavy)
- **metrics**: Time series (5 data points, numeric-heavy)
- **package**: npm manifest (flat object with nested deps)
- **issue**: GitHub issue (mixed nesting, labels array)
- **irregular**: Event log (objects with different keys)

## Why Not Byte-Optimized Formats?

Formats like JSONito achieve excellent byte compression but **cost more tokens** due to:

- Deduplication preambles and pointer references
- Tokenizer bias toward JSON syntax

Also, LLMs cannot reliably generate complex formats requiring state tracking.

## Environment

- **Model**: Qwen3-Coder-30b @ 5-bit quantization
- **API**: LM Studio localhost:1234
- **Date**: 2026-01-09
