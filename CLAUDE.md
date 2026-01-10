# CLAUDE.md

## Project

Research project testing data encodings for LLM token efficiency. You (Claude) design experiments, local models (Qwen3 via LM Studio) are test subjects.

## Current Results

**Jot** is the leading format. See `encoding-formats/SUMMARY.md` for full comparison.

| Mode    | Jot vs JSON  |
|---------|--------------|
| Compact | -16% to -17% |
| Pretty  | -35% to -41% |

## Jot Format

Encoder: `encoding-formats/jot/jot.ts`

Features:

- Minimal quoting (only quote strings with unsafe chars like `: ; , { } [ ] "`)
- Key folding: `{a:{b:1}}` → `{a.b:1}` (quote keys with literal dots: `{"a.b":1}`)
- Tables: `[{a:1},{a:2}]` → `{{:a;1;2}}` (only when 2+ consecutive objects share schema)
- Pretty-print mode with `stringify(data, { pretty: true })`

Pretty-print rules:

- Single-key objects always inline: `{ key: value }`
- Array items use compact format unless last value is multi-line
- Tables: schema rows at 1 indent level, data rows at 2 indent levels

## Scripts

### Regenerating Encodings

```bash
bun encoding-formats/gen.ts
```

Regenerates all format files (.jot, .yaml, etc.) from source JSON files.

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

### Testing LLM Accuracy

**Quick test (3 docs):**

```bash
bun scripts/test-llm-accuracy.ts [format|all] [--encode|--decode|--both]
```

**Comprehensive test (all docs, multiple runs):**

```bash
bun scripts/test-llm-comprehensive.ts [format|all] [runs=3]
```

Both scripts test Qwen's ability to encode/decode formats using FORMAT.md as reference. Requires LM Studio running on localhost:1234.

Results saved to `encoding-formats/llm-accuracy-<date>.json` or `encoding-formats/llm-comprehensive-<timestamp>.json`.

### Full Workflow

1. Edit source JSON files in `encoding-formats/json/`
2. `bun encoding-formats/gen.ts` - regenerate all formats
3. `bun scripts/count-format.ts all` - recount Qwen tokens (requires LM Studio)
4. `ANTHROPIC_API_KEY=... bun scripts/count-claude-tokens.ts` - recount Claude tokens
5. `bun scripts/update-summary.ts` - regenerate SUMMARY.md tables

## Key Files

- `encoding-formats/SUMMARY.md` - token comparison results
- `encoding-formats/gen.ts` - unified generator for all formats
- `encoding-formats/jot/jot.ts` - Jot encoder/decoder
- `encoding-formats/jot/FORMAT.md` - Jot format specification
- `encoding-formats/json/*.json` - 18 source test documents
- `scripts/test-llm-accuracy.ts` - LLM encode/decode accuracy testing
