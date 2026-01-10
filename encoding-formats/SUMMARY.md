# Encoding Format Comparison

Token counts measured on Qwen3-Coder-30b. For LLM systems, **tokens matter more than bytes**.

## Recommendation

**Use Jot** for minimal tokens — combines minimal quoting, key folding, and table syntax.

## Token Efficiency

<!-- TOKEN_EFFICIENCY_START -->
| Format                                              | Tokens | vs JSON  | Bytes  | vs JSON  |
|-----------------------------------------------------|-------:|---------:|-------:|---------:|
| **[Jot](jot/)**                                     |  6,388 |     -18% | 16,324 |     -29% |
| [JSONito](https://github.com/creationix/jsonito)    |  7,615 |      -2% | 13,733 |     -41% |
| [Lax](lax/)                                         |  7,678 |      -1% | 20,595 |     -11% |
| [JSON](https://www.json.org/) (mini)                |  7,748 | baseline | 23,119 | baseline |
| [D2](https://github.com/creationix/d2)              |  8,059 |      +4% | 16,891 |     -27% |
| [Jot](jot/) (pretty)                                |  8,092 |      +4% | 22,656 |      -2% |
| [TOON](toon/)                                       |  8,098 |      +5% | 22,380 |      -3% |
| [YAML](https://yaml.org/)                           |  9,330 |     +20% | 26,366 |     +14% |
| [TOML](https://toml.io/)                            |  9,980 |     +29% | 28,549 |     +23% |
<!-- TOKEN_EFFICIENCY_END -->

## Format Descriptions

### Jot

Minimal quoting + key folding + table syntax + count guards.

```jot
{name:Alice,users:2m[:id,email|1,a@ex.com|2,b@ex.com],tags:3x[a,b,c]}
```

Features:

- **Minimal quoting**: Only quote strings containing unsafe chars (`: , { } [ ] ( ) " |`), reserved words, or whitespace
- **Key folding**: `{a:{b:{c:1}}}` → `(a.b.c:1)` (works at root and nested levels)
- **Tables**: `[{a:1},{a:2}]` → `2m[:a|1|2]` (only when schema is reused)
- **Count guards**: `Nx[...]` for arrays, `Nm[...]` for tables (single-item arrays omit guard)
- **Pretty-print mode**: Human-readable output with proper indentation

### Lax

Relaxed JSON: no commas, no key quotes. **0% vs JSON**.

```lax
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

| Format      | Small | Medium | Large | Hikes | Chat | Metrics | Package | Issue | Irregular | Users-50 | Logs  | Firewall | Products | Routes |
|-------------|------:|-------:|------:|------:|-----:|--------:|--------:|------:|----------:|---------:|------:|---------:|---------:|-------:|
| **Jot**     |    47 |     72 |   250 |   116 |   69 |     102 |      85 |    80 |        65 |      665 | 2,046 |      673 |      717 |  1,236 |
| JSONito     |    45 |    103 |   312 |   158 |   86 |      89 |     101 |    89 |        59 |    1,234 | 1,941 |      919 |      846 |  1,426 |
| Lax         |    45 |     92 |   265 |   144 |   79 |     117 |      95 |    88 |        69 |    1,229 | 2,166 |      785 |      876 |  1,442 |
| JSON (mini) |    48 |     97 |   266 |   158 |   76 |     117 |      97 |    88 |        68 |    1,279 | 2,108 |      827 |      866 |  1,459 |
| TOON        |    50 |     83 |   308 |   122 |   68 |     110 |     104 |    90 |        88 |      763 | 2,492 |    1,026 |      954 |  1,558 |
| D2          |    55 |    104 |   316 |   173 |   80 |     138 |      90 |    97 |        81 |    1,202 | 2,092 |      894 |      994 |  1,536 |
| YAML        |    56 |    123 |   327 |   187 |   82 |     140 |     104 |    98 |        87 |    1,597 | 2,487 |    1,029 |    1,095 |  1,696 |
| TOML        |    56 |    118 |   377 |   189 |   84 |     139 |     104 |    99 |        86 |    1,625 | 2,498 |    1,495 |    1,114 |  1,790 |

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
- **firewall**: WAF rules (deeply nested, mixed schemas)
- **products**: E-commerce catalog (nested specs, variants)
- **routes**: API routing config (large uniform tables)

## Why Not Byte-Optimized Formats?

Formats like JSONito achieve excellent byte compression and can save tokens on large uniform datasets (-4% here), but:

- Gains are inconsistent (small docs often cost more tokens than JSON)
- Deduplication preambles add overhead that doesn't scale down
- LLMs cannot reliably generate formats requiring state tracking

## Environment

- **Model**: Qwen3-Coder-30b @ 5-bit quantization
- **API**: LM Studio localhost:1234
- **Date**: 2026-01-09
