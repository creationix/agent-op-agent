# CLAUDE.md

## Project

Research project testing data encodings for LLM token efficiency. You (Claude) design experiments, local models (Qwen3 via LM Studio) are test subjects.

## Current Results

**Jot** is the leading format at -19% tokens vs JSON. See `encoding-formats/SUMMARY.md` for full comparison.

| Format | vs JSON |
| ------ | ------- |
| Jot | -19% |
| Jot (pretty) | +3% |
| JSON | baseline |
| YAML | +20% |

## Jot Format

Encoder: `encoding-formats/jot/jot.ts`

Features:

- Minimal quoting (only quote strings with unsafe chars)
- Key folding: `{a:{b:1}}` → `{a.b:1}` (quote keys with literal dots: `{"a.b":1}`)
- Tables: `[{a:1},{a:2}]` → `[:a|1|2]` (only when schema reused)
- Pretty-print mode with `stringify(data, { pretty: true })`

Pretty-print rules:

- Single-key objects inline: `{ key: value }`
- Single-item arrays compact: `[{...}]`
- Schema rows indent 1 char less than data rows
- Tables start on same line as key: `labels: [`

## MCP Tools

LM Studio bridge on `localhost:1234`:

- `chat_completion(prompt, system_prompt, temperature, max_tokens)` - query local model

## Scripts

- `bun scripts/regen.ts` - regenerate all encodings and token counts
- `bun scripts/count-tokens.ts file1 file2...` - count tokens for specific files

## Next Steps

1. **Implement decoders** for Lax and Jot (parse back to JSON)
2. **Verify round-trip** encode/decode for top formats
3. **LLM read/write testing** - measure model accuracy generating these formats

## Key Files

- `encoding-formats/SUMMARY.md` - token comparison results
- `encoding-formats/jot/jot.ts` - Jot encoder (stringify + tests)
- `encoding-formats/jot/gen.ts` - generates .jot and .pretty.jot files
- `encoding-formats/json/*.json` - 17 source test documents
