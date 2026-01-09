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
| LJSON v2 | 373 | -9% | Yes |
| NQJSON | 388 | -6% | Yes |
| LJSON | 402 | -2% | Yes |
| JSON | 411 | baseline | Yes |

**LJSON v2**: "JSON, but no commas, no quotes on keys, and uniform arrays use `[keys|{vals}...]` header syntax."

**NQJSON**: "JSON, but no quotes unless needed."

**LJSON**: "JSON, but no commas and no quotes on keys."

### Tool Calling ([tool-call-formats/](tool-call-formats/SUMMARY.md))

| Format | Tokens (13 tools) | Reduction |
|--------|------------------:|----------:|
| Positional | 188 | **89%** |
| JSON Schema | 1696 | baseline |

**Positional**: `<tool>name("arg", opt=val)</tool>` with `<result>...</result>` responses
