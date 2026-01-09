# LLM Encoding Research

Testing alternative data encodings for LLM systems, optimizing for token efficiency.

## Setup

1. Install [LM Studio](https://lmstudio.ai) and load a model (e.g., `qwen/qwen3-coder-30b`)
2. Start LM Studio's local server (default: `localhost:1234`)
3. Pull MCP bridge: `docker pull ghcr.io/infinitimeless/lmstudio-mcp:latest`
4. Run Claude Code in this directory (`.mcp.json` auto-configures the bridge)

## Results

See [samples/SUMMARY.md](samples/SUMMARY.md) for encoding comparison results.

**Key finding**: LJSON (JSON without commas or key quotes) is the most token-efficient format that LLMs can reliably generate.

| Format | Bytes | Tokens | LLM Can Generate |
|--------|------:|-------:|------------------|
| LJSON | 1159 | 402 | Yes |
| JSON | 1323 | 411 | Yes |
| JSONito | 902 | 460 | No |
| D2 | 1161 | 459 | No |
