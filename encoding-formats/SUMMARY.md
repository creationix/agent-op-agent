# Encoding Format Comparison

Token counts measured on Qwen3-Coder-30b. For LLM systems, **tokens matter more than bytes**.

## Recommendation

**Use Jot** for minimal tokens — combines minimal quoting, key folding, and table syntax.

## Token Efficiency

<!-- TOKEN_EFFICIENCY_START -->
| Format                                              | Tokens | vs JSON  | Bytes  | vs JSON  |
|-----------------------------------------------------|-------:|---------:|-------:|---------:|
| [Jot-mix](jot-mix/)                                 |  6,463 |     -17% | 16,389 |     -29% |
| **[Jot](jot/)**                                     |  6,584 |     -15% | 17,058 |     -26% |
| [JSONito](https://github.com/creationix/jsonito)    |  7,615 |      -2% | 13,733 |     -41% |
| [Lax](lax/)                                         |  7,678 |      -1% | 20,595 |     -11% |
| [JSON](https://www.json.org/) (mini)                |  7,748 | baseline | 23,119 | baseline |
| [TOON](toon/)                                       |  7,989 |      +3% | 21,725 |      -6% |
| [D2](https://github.com/creationix/d2)              |  8,059 |      +4% | 16,891 |     -27% |
| [YAML](https://yaml.org/)                           |  9,330 |     +20% | 26,366 |     +14% |
| [TOML](https://toml.io/)                            |  9,980 |     +29% | 28,549 |     +23% |
<!-- TOKEN_EFFICIENCY_END -->

## Format Descriptions

### Jot

Minimal quoting + key folding + table syntax + count guards.

```
{name:Alice,users:2r[id,email|1,a@ex.com|2,b@ex.com],tags:3x[a,b,c]}
```

Features:

- **Minimal quoting**: Only quote strings containing unsafe chars (`: , { } [ ] ( ) " |`), reserved words, or whitespace
- **Key folding**: `{a:{b:{c:1}}}` → `(a.b.c:1)`
- **Tables**: `[{a:1},{a:2}]` → `[a|1|2]`
- **Count guards**: `Nx[...]` for arrays, `Nr[...]` for tables (truncation detection)

### Jot-mix

Jot with mixed table support for heterogeneous object arrays.

```
3m[:a,b|1,2|:a|3|:a,b|4,5]
```

When array objects have different schemas:

- `[:schema|row|row|:newschema|row...]` - schema rows start with `:`
- Schema stays active until next `:` row
- LLM-friendly: clear separation between schema and data rows

### Lax

Relaxed JSON: no commas, no key quotes. **0% vs JSON**.

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

| Format      | Small | Medium | Large | Hikes | Chat | Metrics | Package | Issue | Irregular | Users-50 | Logs  | Products |
|-------------|------:|-------:|------:|------:|-----:|--------:|--------:|------:|----------:|---------:|------:|---------:|
| **Jot**     |    47 |     71 |   254 |   115 |   69 |     101 |      85 |    79 |        65 |      664 | 2,033 |      795 |
| JSONito     |    45 |    103 |   312 |   158 |   86 |      89 |     101 |    89 |        59 |    1,234 | 1,941 |      846 |
| TOON        |    50 |     83 |   308 |   122 |   68 |     110 |     104 |    90 |        88 |      763 | 2,492 |      954 |
| Lax         |    45 |     92 |   265 |   144 |   79 |     117 |      95 |    88 |        69 |    1,229 | 2,166 |      876 |
| JSON (mini) |    48 |     97 |   266 |   158 |   76 |     117 |      97 |    88 |        68 |    1,279 | 2,108 |      866 |
| D2          |    55 |    104 |   316 |   173 |   80 |     138 |      90 |    97 |        81 |    1,202 | 2,092 |      994 |
| YAML        |    56 |    123 |   327 |   187 |   82 |     140 |     104 |    98 |        87 |    1,597 | 2,487 |    1,095 |
| TOML        |    56 |    118 |   377 |   189 |   84 |     139 |     104 |    99 |        86 |    1,625 | 2,498 |    1,114 |

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
- **users-50**: 50 user records (uniform schema, table-friendly)
- **logs**: 50 log entries (semi-uniform with varying fields)
- **products**: E-commerce catalog (nested specs, variants)

## Why Not Byte-Optimized Formats?

Formats like JSONito achieve excellent byte compression and can save tokens on large uniform datasets (-4% here), but:

- Gains are inconsistent (small docs often cost more tokens than JSON)
- Deduplication preambles add overhead that doesn't scale down
- LLMs cannot reliably generate formats requiring state tracking

## Environment

- **Model**: Qwen3-Coder-30b @ 5-bit quantization
- **API**: LM Studio localhost:1234
- **Date**: 2026-01-09
