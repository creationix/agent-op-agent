# LLM Encoding Research

Testing token-efficient data formats for LLM contexts.

## Results

### Data Encoding

See [encoding-formats/SUMMARY.md](encoding-formats/SUMMARY.md) for full comparison.

| Format       | Tokens | vs JSON  |
|--------------|-------:|----------|
| **Jot**      |  6,525 | **-16%** |
| JSON (mini)  |  7,748 | baseline |
| Jot (pretty) |  8,239 | -35%*    |
| JSON (pretty)|  12,656| baseline |

*Pretty formats compared against pretty JSON baseline.

**Jot**: JSON with minimal quoting. Unquoted keys and string values where safe, plus optional key folding and table syntax.

```jot
{name:Alice,age:30,items:[a,b,c],active:true}
```

### Tool Calling

See [tool-call-formats/SUMMARY.md](tool-call-formats/SUMMARY.md).

| Format      | Tokens (13 tools) | Reduction  |
|-------------|------------------:|------------|
| Positional  |               188 | **-89%**   |
| JSON Schema |             1,696 | baseline   |

## Setup

1. Install [Bun](https://bun.sh)
2. `bun install`

For LLM accuracy testing:

1. Install [LM Studio](https://lmstudio.ai) and load a model (e.g., Qwen3-Coder-30b)
2. Start LM Studio's local server (default: `localhost:1234`)

## Usage

```bash
# Regenerate all format encodings
bun encoding-formats/gen.ts

# Count tokens (requires LM Studio)
bun scripts/count-format.ts all

# Count Claude tokens (free, requires API key)
ANTHROPIC_API_KEY=... bun scripts/count-claude-tokens.ts

# Update summary tables
bun scripts/update-summary.ts
```
