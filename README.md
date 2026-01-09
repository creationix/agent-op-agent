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
| Jot | 857 | **-16%** | Yes |
| Jot-safe | 886 | -13% | Yes |
| JSON | 1,015 | baseline | Yes |
| TOON | 1,023 | +1% | Yes |

**Jot**: JSON Optimized for Tokens. Minimal quoting + key folding + table syntax (`[schema|row|row]`).

**Jot-safe**: Jot + count guards (`Nx[...]` for arrays, `Nr[...]` for tables).

### Tool Calling ([tool-call-formats/](tool-call-formats/SUMMARY.md))

| Format | Tokens (13 tools) | Reduction |
|--------|------------------:|----------:|
| Positional | 188 | **89%** |
| JSON Schema | 1696 | baseline |

**Positional**: `<tool>name("arg", opt=val)</tool>` with `<result>...</result>` responses
