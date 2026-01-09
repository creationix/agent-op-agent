# CLAUDE.md

## Project

Research project testing data encodings for LLM token efficiency. You (Claude) design experiments, local models (Qwen3 via LM Studio) are test subjects.

## MCP Tools

LM Studio bridge on `localhost:1234`:

- `health_check()` - verify connection
- `list_models()` / `get_current_model()` - model info
- `chat_completion(prompt, system_prompt, temperature, max_tokens)` - query local model

For accurate token counts, use curl directly:
```bash
curl -s http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"...","messages":[...],"max_tokens":1}' | jq '.usage.prompt_tokens'
```

## Key Files

- `samples/SUMMARY.md` - encoding comparison results
- `samples/*/gen.ts` - encoders for each format
- `samples/json/*.json` - source test data

## Research Principles

- Measure real token counts, not estimates
- Test on small models (Qwen3), not frontier models
- Formats must be LLM-generatable, not just parseable
