# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This project designs and tests LLM-native encoding and retrieval systems. It creates a test loop where a large SOTA model (like Claude Opus 4.5) acts as the host agent that designs experiments, while small local models (like Qwen3-Coder-30b) run via LM Studio serve as test subjects. This architecture allows the creative design work to be done by a powerful model while optimizing for less powerful local models.

## Core Architecture

**Two-tier agent system:**

- **Host Agent**: Large SOTA model (Claude Opus 4.5) - Does creative design work, proposes alternative encodings, and analyzes results
- **Test Subject**: Small local model via LM Studio - Tests the designed encodings and tool call syntaxes in practice

**Communication**: The host agent interacts with local models through LM Studio's API on localhost:1234 via an MCP tool call bridge (LMStudio-MCP).

## Research Goals

1. Find better encodings for LLM-native retrieval systems (JSON alternatives)
2. Find better prompting and retrieval techniques for LLM-native retrieval systems
3. Find better tool call syntaxes for LLM-native retrieval systems

The key metric is token count - designs are tested on real LLMs to measure actual token usage.

## Installation and Setup

### Prerequisites

1. **Docker**: Ensure Docker is installed and running
2. **LM Studio**: Download and install from [lmstudio.ai](https://lmstudio.ai)

### LM Studio Setup

1. Launch LM Studio
2. Load a model (recommended: `qwen/qwen3-coder-30b` for code tasks)
3. Start the local server - it runs on `localhost:1234` by default

### LM Studio MCP Bridge Setup

The MCP bridge allows Claude Code to communicate with local models in LM Studio. We use the [infinitimeless/LMStudio-MCP](https://github.com/infinitimeless/LMStudio-MCP) Docker image.

**Pull the Docker image:**

```bash
docker pull ghcr.io/infinitimeless/lmstudio-mcp:latest
```

**Verify the connection (optional):**

```bash
curl http://localhost:1234/v1/models
```

This should return a JSON list of loaded models if LM Studio is running correctly.

## MCP Configuration

The project includes a `.mcp.json` file that configures Claude Code to use the LM Studio MCP bridge. This file is already set up and will be loaded automatically when you start Claude Code in this project directory.

**Configuration file (`.mcp.json`):**

```json
{
  "mcpServers": {
    "lmstudio-mcp": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--network=host", "ghcr.io/infinitimeless/lmstudio-mcp:latest"]
    }
  }
}
```

### Available MCP Tools

Once connected, the following tools are available:

- **health_check()**: Verify LM Studio API is accessible
- **list_models()**: Get available models from LM Studio
- **get_current_model()**: Get the currently loaded model
- **chat_completion(prompt, system_prompt, temperature, max_tokens)**: Send prompts to the local model

### Troubleshooting

- **MCP not connecting**: Ensure LM Studio is running with a model loaded
- **Docker network issues**: The `--network=host` flag is required for the container to reach localhost:1234
- **Model not responding**: Check LM Studio's server log for errors

## Working with This Repository

**Experiments and Results:**

- Results are stored in a `results` folder (referenced in README but may not exist yet)
- When conducting experiments, document findings in this folder
- Each experiment should test token count on real LLMs, not theoretical calculations

**Design Philosophy:**

- The host agent (you, Claude) should propose creative alternatives to existing encoding formats
- Test designs by actually running them through local models via the MCP bridge
- Measure real token usage, not estimated counts
- Focus on practical improvements for smaller, less capable models

**Key Consideration:**
When designing encodings or tool call syntaxes, remember that the optimization target is small local models (like Qwen3-Coder-30b), not large frontier models. What works efficiently for Claude may not work as well for smaller models.
