# LLM Encoding Research

Testing token-efficient alternatives to standard LLM encodings and protocols.

## Setup

1. Install [LM Studio](https://lmstudio.ai) and load a model (e.g., `qwen/qwen3-coder-30b`)
2. Start LM Studio's local server (default: `localhost:1234`)
3. Pull MCP bridge: `docker pull ghcr.io/infinitimeless/lmstudio-mcp:latest`
4. Run Claude Code in this directory (`.mcp.json` auto-configures the bridge)

## Results

### Data Encoding ([encoding-formats/](encoding-formats/SUMMARY.md))

| Format | Tokens | vs JSON | LLM Can Generate |
|--------|-------:|--------:|------------------|
| NQJSON2 | 463 | **-19%** | Yes |
| NQJSON2-safe | 479 | -16% | Yes |
| JSON | 569 | baseline | Yes |
| TOON | 583 | +2% | Yes |

**NQJSON2**: JSON with minimal quoting + uniform arrays using `[keys|vals|vals|...]` header syntax.

**NQJSON2-safe**: NQJSON2 + `n|` count prefix on arrays for truncation detection.

### Tool Calling ([tool-call-formats/](tool-call-formats/SUMMARY.md))

| Format | Tokens (13 tools) | Reduction |
|--------|------------------:|----------:|
| Positional | 188 | **89%** |
| JSON Schema | 1696 | baseline |

**Positional**: `<tool>name("arg", opt=val)</tool>` with `<result>...</result>` responses
