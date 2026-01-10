# Token Counts by Format

## Qwen Tokenizer (LM Studio)

Tokens measured using **Qwen3-Coder-30b** via LM Studio API. This is the primary tokenizer used for testing local model efficiency.

<!-- QWEN_CHART_START -->
```mermaid
xychart-beta
    title "Token Savings vs JSON (negative = better)"
    x-axis ["Users50", "Hikes", "Medium", "KF-arr", "Products", "Firewall", "KF-basic", "Routes", "Metrics", "Package", "Chat", "KF-mix", "Issue", "Small", "Large", "Irregular", "Logs"]
    y-axis "% vs JSON" -60 --> 40
    line "JSON" [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    line "Jot" [-48, -30, -28, -26, -20, -19, -19, -16, -15, -12, -12, -12, -11, -8, -8, -7, -3]
    line "Lax" [-4, -9, -5, 0, 1, -5, -5, -1, 0, -2, 4, -6, 0, -6, 0, 1, 3]
    line "YAML" [25, 18, 27, 19, 26, 24, 10, 16, 20, 7, 8, 14, 11, 17, 23, 28, 18]
    line "TOON" [-40, -23, -14, 9, 10, 30, 9, 8, -6, 7, -11, 13, 2, 4, 18, 29, 18]
```
<!-- QWEN_CHART_END -->

### Per-File Breakdown (Qwen)

| Format | Chat | Metrics | Large | Key-folding-mixed | Logs | Firewall | Small | Github-issue | Users-50 | Medium | Hikes | Package | Key-folding-basic | Irregular | Key-folding-with-array | Products | Routes | Total | Bytes |
|--------|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|
| jot | 67 | 100 | 244 | 69 | 2043 | 666 | 44 | 78 | 662 | 70 | 111 | 85 | 47 | 63 | 43 | 693 | 1220 | 6305 | 16,228 |
| jsonito | 86 | 89 | 312 | 82 | 1941 | 919 | 45 | 89 | 1234 | 103 | 158 | 101 | 62 | 59 | 63 | 846 | 1426 | 7615 | 13,733 |
| lax | 79 | 117 | 265 | 73 | 2166 | 785 | 45 | 88 | 1229 | 92 | 144 | 95 | 55 | 69 | 58 | 876 | 1442 | 7678 | 20,595 |
| JSON (mini) | 76 | 117 | 266 | 78 | 2108 | 827 | 48 | 88 | 1279 | 97 | 158 | 97 | 58 | 68 | 58 | 866 | 1459 | 7748 | 23,119 |
| jot-pretty | 72 | 123 | 365 | 96 | 2259 | 1122 | 59 | 105 | 862 | 100 | 142 | 120 | 54 | 103 | 52 | 826 | 1518 | 7978 | 22,560 |
| d2 | 80 | 138 | 316 | 80 | 2092 | 894 | 55 | 97 | 1202 | 104 | 173 | 90 | 60 | 81 | 67 | 994 | 1536 | 8059 | 16,891 |
| toon | 68 | 110 | 313 | 88 | 2492 | 1073 | 50 | 90 | 763 | 83 | 122 | 104 | 63 | 88 | 63 | 954 | 1574 | 8098 | 22,380 |
| yaml | 82 | 140 | 327 | 89 | 2487 | 1029 | 56 | 98 | 1597 | 123 | 187 | 104 | 64 | 87 | 69 | 1095 | 1696 | 9330 | 26,366 |
| toml | 84 | 139 | 377 | 85 | 2498 | 1495 | 56 | 99 | 1625 | 118 | 189 | 104 | 60 | 86 | 61 | 1114 | 1790 | 9980 | 28,549 |

---

## Legacy Claude Tokenizer

Tokens measured using **@anthropic-ai/tokenizer** (Claude's legacy tokenizer). This is the older tokenizer used by earlier Claude models.

<!-- LEGACY_CHART_START -->
```mermaid
xychart-beta
    title "Token Savings vs JSON (negative = better)"
    x-axis ["Users50", "Hikes", "Products", "Metrics", "Medium", "Routes", "Chat", "KF-arr", "Large", "KF-basic", "Issue", "KF-mix", "Firewall", "Package", "Logs", "Small", "Irregular"]
    y-axis "% vs JSON" -50 --> 30
    line "JSON" [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    line "Jot" [-37, -27, -22, -21, -21, -12, -11, -10, -8, -8, -7, -6, -2, -2, 0, 0, 2]
    line "Lax" [0, -5, 1, 0, -3, -1, 4, 4, -3, -8, -1, -7, -1, -2, 1, 0, 4]
    line "YAML" [3, 3, 4, 5, 4, 4, 4, 15, 9, 8, 7, 4, 8, 0, 2, 11, 8]
    line "TOON" [-37, -24, -7, -21, -20, 3, -11, 12, 4, 6, 0, 6, 13, 0, 8, 3, 10]
```
<!-- LEGACY_CHART_END -->

Note: The legacy tokenizer may produce different results than modern Claude models, but is useful for comparison and runs locally without API calls.

---

## Modern Claude Tokenizer

Tokens measured using **Claude API** token counting endpoint (claude-sonnet-4). This represents the actual token usage for modern Claude models. Token counting is free via the API.

<!-- CLAUDE_CHART_START -->
```mermaid
xychart-beta
    title "Token Savings vs JSON (negative = better)"
    x-axis ["Users50", "Hikes", "Products", "Metrics", "Medium", "KF-basic", "KF-arr", "Large", "Firewall", "Chat", "KF-mix", "Routes", "Issue", "Irregular", "Package", "Small", "Logs"]
    y-axis "% vs JSON" -50 --> 40
    line "JSON" [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    line "Jot" [-40, -31, -25, -25, -24, -24, -24, -17, -15, -15, -15, -13, -12, -6, -6, -4, 1]
    line "Lax" [0, -1, 0, -1, -3, -17, -11, -8, -13, -1, -11, -4, -3, -2, -3, 2, 1]
    line "YAML" [22, 19, 27, 19, 19, 1, 14, 16, 13, 6, 6, 9, 8, 21, 4, 13, 18]
    line "TOON" [-36, -25, 8, -18, -14, 1, 6, 12, 17, -10, 8, 7, 1, 24, 5, 2, 21]
```
<!-- CLAUDE_CHART_END -->

Note: Run `ANTHROPIC_API_KEY=... bun scripts/count-claude-tokens.ts` to regenerate Claude counts.
