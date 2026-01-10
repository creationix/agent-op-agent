# CLAUDE.md

## Project

Research project testing data encodings for LLM token efficiency. You (Claude) design experiments, local models (Qwen3 via LM Studio) are test subjects.

## Current Results

**Jot** is the leading format at -19% tokens vs JSON. See `encoding-formats/SUMMARY.md` for full comparison.

**Compact** (vs minified JSON):

| Format | vs JSON |
| ------ | ------- |
| Jot | -19% |
| JSON (mini) | baseline |

**Pretty** (vs pretty JSON):

| Format | vs JSON |
| ------ | ------- |
| Jot (pretty) | -37% |
| JSON (pretty) | baseline |

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

- `bun encoding-formats/gen.ts` - regenerate all format encodings
- `bun scripts/count-format.ts <format|all>` - count tokens for a format folder
- `bun scripts/update-summary.ts` - update SUMMARY.md from counts.txt files

## Next Steps

1. **LLM read/write testing** - measure model accuracy generating these formats
2. **Optimize tokenization** - investigate why certain patterns tokenize poorly

## Key Files

- `encoding-formats/SUMMARY.md` - token comparison results
- `encoding-formats/gen.ts` - unified generator for all formats
- `encoding-formats/jot/jot.ts` - Jot encoder/decoder
- `encoding-formats/json/*.json` - 17 source test documents
- `encoding-formats/json/smart-json.ts` - smart JSON formatter
