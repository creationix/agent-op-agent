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

### Regenerating Encodings

```bash
bun encoding-formats/gen.ts
```

Regenerates all format files (.jot, .lax, .yaml, etc.) from source JSON files.

### Counting Tokens

**Qwen (via LM Studio)** - requires LM Studio running on localhost:1234:

```bash
bun scripts/count-format.ts <format|all>
```

Writes results to `encoding-formats/<format>/counts.txt`.

**Claude API** - requires API key, FREE (token counting endpoint has no usage cost):

```bash
ANTHROPIC_API_KEY=... bun scripts/count-claude-tokens.ts [model]
```

Models: `sonnet` (default), `opus`, `haiku` - all share the same tokenizer.
Writes results to `encoding-formats/claude-counts-<model>.txt`.

### Updating Summary Tables

```bash
bun scripts/update-summary.ts
```

Reads counts from:

- `encoding-formats/*/counts.txt` - Qwen token counts
- `encoding-formats/claude-counts-sonnet.txt` - Claude token counts
- Computes legacy tokenizer counts using `@anthropic-ai/tokenizer`

Caches slow LM Studio JSON mini/pretty counts for 24 hours.

### Testing LLM Accuracy

```bash
bun scripts/test-llm-accuracy.ts [format|all] [--encode|--decode|--both]
```

Tests Qwen's ability to encode/decode formats using FORMAT.md as reference. Requires LM Studio.

- **Exact match**: Output matches reference encoder exactly
- **Semantic**: Output parses back to correct JSON (allows formatting differences)

Results saved to `encoding-formats/llm-accuracy-<date>.json`.

### Full Workflow

1. Edit source JSON files in `encoding-formats/json/`
2. `bun encoding-formats/gen.ts` - regenerate all formats
3. `bun scripts/count-format.ts all` - recount Qwen tokens (requires LM Studio)
4. `ANTHROPIC_API_KEY=... bun scripts/count-claude-tokens.ts` - recount Claude tokens
5. `bun scripts/update-summary.ts` - regenerate SUMMARY.md tables

## Next Steps

1. **Optimize tokenization** - investigate why certain patterns tokenize poorly

## Key Files

- `encoding-formats/SUMMARY.md` - token comparison results
- `encoding-formats/gen.ts` - unified generator for all formats
- `encoding-formats/jot/jot.ts` - Jot encoder/decoder
- `encoding-formats/*/FORMAT.md` - format specifications for LLM prompts (jot, lax, toon)
- `encoding-formats/json/*.json` - 17 source test documents
- `encoding-formats/json/smart-json.ts` - smart JSON formatter
- `scripts/test-llm-accuracy.ts` - LLM encode/decode accuracy testing
