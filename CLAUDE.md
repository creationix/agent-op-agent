# CLAUDE.md

## Project

Research project testing data encodings for LLM token efficiency. You (Claude) design experiments, local models (Qwen3 via LM Studio) are test subjects.

## MCP Tools

LM Studio bridge on `localhost:1234`:

- `health_check()` - verify connection
- `list_models()` / `get_current_model()` - model info
- `chat_completion(prompt, system_prompt, temperature, max_tokens)` - query local model

## Scripts

- `bun scripts/regen.ts` - regenerate all encodings and output token count table
- `bun scripts/count-tokens.ts file1 file2...` - count tokens for specific files

## Key Files

- `encoding-formats/SUMMARY.md` - encoding comparison results
- `encoding-formats/*/gen.ts` - encoders for each format
- `encoding-formats/json/*.json` - source test data

## Research Principles

- Measure real token counts, not estimates
- Test on small models (Qwen3), not frontier models
- Formats must be LLM-generatable, not just parseable
