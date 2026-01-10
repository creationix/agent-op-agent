# Encoding Format Comparison

Token counts for 18 test documents across three tokenizers. For LLM systems, **tokens matter more than bytes**.

## Recommendation

**Use Jot** for LLM contexts — saves 16-17% tokens vs JSON.

Note: Small models (e.g., Qwen3-30b) may struggle to encode large Jot documents accurately due to the format's advanced features like tables and key folding.

## Token Efficiency

<!-- CHART_START -->
```mermaid
xychart-beta
    title "Token Counts by Format"
    x-axis ["Jot", "JSON-m", "JSONito", "Jot-P", "D2", "TOON", "YAML", "TOML", "JSON-s", "JSON-p"]
    y-axis "Tokens" 0 --> 16000
    line "Qwen" [6525, 7748, 7757, 8239, 8292, 8315, 9543, 10180, 11799, 12656]
    line "Legacy" [6420, 7377, 7794, 7204, 7582, 7079, 7661, 11204, 10966, 11937]
    line "Claude" [6747, 8132, 8327, 8500, 7928, 8405, 9456, 11485, 12687, 14403]
```
<!-- CHART_END -->

### Compact Formats

For machine-to-machine or LLM contexts where readability isn't required.

<!-- COMPACT_START -->
| Format                                              | Qwen           | Legacy         | Claude         | Bytes          |
|-----------------------------------------------------|---------------:|---------------:|---------------:|---------------:|
| **[Jot](jot/)**                                     |   6,525 (-16%) |   6,420 (-13%) |   6,747 (-17%) |  16,621 (-28%) |
| [JSON](https://www.json.org/) (mini)                |          7,748 |          7,377 |          8,132 |         23,119 |
| [JSONito](https://github.com/creationix/jsonito)    |    7,757 (+0%) |    7,794 (+6%) |    8,327 (+2%) |  14,059 (-39%) |
| [D2](https://github.com/creationix/d2)              |    8,292 (+7%) |    7,582 (+3%) |    7,928 (-3%) |  17,328 (-25%) |
<!-- COMPACT_END -->

### Pretty-Printed Formats

For human-readable output or when LLMs need to read/write structured data.

<!-- PRETTY_START -->
| Format                                              | Qwen           | Legacy         | Claude         | Bytes          |
|-----------------------------------------------------|---------------:|---------------:|---------------:|---------------:|
| **[Jot](jot/) (pretty)**                            |   8,239 (-35%) |   7,204 (-40%) |   8,500 (-41%) |  23,676 (-41%) |
| [TOON](toon/)                                       |   8,315 (-34%) |   7,079 (-41%) |   8,405 (-42%) |  22,780 (-43%) |
| [YAML](https://yaml.org/)                           |   9,543 (-25%) |   7,661 (-36%) |   9,456 (-34%) |  26,757 (-33%) |
| [TOML](https://toml.io/)                            |  10,180 (-20%) |   11,204 (-6%) |  11,485 (-20%) |  28,930 (-27%) |
| [JSON](json/smart-json.ts) (smart)                  |   11,799 (-7%) |   10,966 (-8%) |  12,687 (-12%) |  32,657 (-18%) |
| [JSON](https://www.json.org/) (pretty)              |         12,656 |         11,937 |         14,403 |         39,884 |
<!-- PRETTY_END -->

## Format Descriptions

### [Jot](jot/)

JSON with minimal quoting. Unquoted keys and string values where safe.

```jot
{name:Alice,age:30,items:[a,b,c],active:true}
```

Optional features (enabled in encoder, tested separately for LLM accuracy):

- **Key folding**: `{a:{b:1}}` → `{a.b:1}` for single-key nested objects
- **Tables**: `[{a:1},{a:2}]` → `{{:a;1;2}}` for uniform object arrays

### [TOON](https://github.com/creationix/toon)

YAML-like indentation with optional table syntax and count guards.

```toon
users[2]{id,name}:
  1,Alice
  2,Bob
```

### [JSONito](https://github.com/creationix/jsonito)

Byte-optimized JSON with string deduplication via preamble dictionary.

### [D2](https://github.com/creationix/d2)

Declarative data format using `=` assignment and shell-like quoting.

## Why Not Byte-Optimized Formats?

Formats like JSONito achieve excellent byte compression (-39%) but:

- Token savings are inconsistent (small docs often cost more than JSON)
- Deduplication preambles add overhead that doesn't scale down
- LLMs cannot reliably generate formats requiring state tracking

## Tokenizers

- **Qwen**: Qwen3-Coder-30b via LM Studio API
- **Legacy**: Anthropic legacy tokenizer (`@anthropic-ai/tokenizer`)
- **Claude**: Claude API token counting endpoint (Sonnet/Opus/Haiku share tokenizer)

## Test Data

18 documents covering diverse structures:

| Document          | Description                      |
|-------------------|----------------------------------|
| small             | Config object (6 fields)         |
| medium            | User list with metadata          |
| large             | Kubernetes deployment spec       |
| hikes             | Tabular records (uniform schema) |
| chat              | LLM conversation (text-heavy)    |
| metrics           | Time series (numeric-heavy)      |
| package           | npm manifest (nested deps)       |
| github-issue      | Mixed nesting with labels        |
| irregular         | Event log (varying keys)         |
| users-50          | 50 user records (table-friendly) |
| logs              | 50 log entries (semi-uniform)    |
| firewall          | WAF rules (deeply nested)        |
| products          | E-commerce catalog (variants)    |
| routes            | API routing config (large tables)|
| key-folding-*     | Key folding test cases           |
| json-counts-cache | Cached token counts              |
