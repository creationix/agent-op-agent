# LLM Encoding Research

Testing token-efficient alternatives to standard LLM encodings and protocols.

## Setup

1. Install [LM Studio](https://lmstudio.ai) and load a model (e.g., `qwen/qwen3-coder-30b`)
2. Start LM Studio's local server (default: `localhost:1234`)
3. Pull MCP bridge: `docker pull ghcr.io/infinitimeless/lmstudio-mcp:latest`
4. Run Claude Code in this directory (`.mcp.json` auto-configures the bridge)

## Results

### Data Encoding ([encoding-formats/SUMMARY.md](encoding-formats/SUMMARY.md))

| Format | Tokens | vs JSON |
|--------|-------:|--------:|
| **Jot** | 6,388 | **-18%** |
| Jot (pretty) | 8,092 | +4% |
| JSON | 7,748 | baseline |
| YAML | 9,330 | +20% |

**Jot**: JSON Optimized for Tokens. Minimal quoting + key folding + table syntax + count guards.

Token counts via Claude API (requires manual run with API key):

```bash
ANTHROPIC_API_KEY=... bun scripts/count-claude-tokens.ts
```

Results saved to `encoding-formats/claude-counts.txt`.

### Tool Calling ([tool-call-formats/](tool-call-formats/SUMMARY.md))

| Format | Tokens (13 tools) | Reduction |
|--------|------------------:|----------:|
| Positional | 188 | **89%** |
| JSON Schema | 1696 | baseline |

**Positional**: `<tool>name("arg", opt=val)</tool>` with `<result>...</result>` responses
