# Jot MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server providing tools for working with the Jot format.

## What is Jot?

Jot is a token-efficient alternative to JSON designed for LLM communication. It achieves 16-41% token savings through:

- **Minimal quoting** - only quote strings containing unsafe characters
- **Key folding** - `{a:{b:1}}` becomes `{a.b:1}`
- **Table compression** - arrays of similar objects use a schema-based format

## Tools

| Tool | Description |
|------|-------------|
| `jot_encode` | Convert JSON to Jot format (compact and/or pretty) |
| `jot_decode` | Parse Jot back to JSON |
| `jot_compare` | Compare byte/character counts between JSON and Jot |

## Usage

### Running the Server

```bash
cd mcp-servers
bun install
bun start
```

The server communicates over stdio using the MCP protocol.

### Testing with the Test Client

```bash
bun run check
```

This runs a simple client that exercises all three tools.

### Integration with Claude Code

Add to your Claude Code MCP settings (`~/.claude/claude_desktop_config.json` or similar):

```json
{
  "mcpServers": {
    "jot": {
      "command": "bun",
      "args": ["run", "/path/to/agent-op-agent/mcp-servers/server.ts"]
    }
  }
}
```

### Integration with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jot": {
      "command": "bun",
      "args": ["run", "/path/to/agent-op-agent/mcp-servers/server.ts"]
    }
  }
}
```

## Example Tool Calls

### jot_encode

Input:
```json
{"json": "{\"users\": [{\"id\": 1, \"name\": \"Alice\"}, {\"id\": 2, \"name\": \"Bob\"}]}"}
```

Output:
```
Compact:
{users:{{:id,name;1,Alice;2,Bob}}}

Pretty:
{ users: {{
  :id, name
    1, Alice
    2, Bob
}} }
```

### jot_decode

Input:
```json
{"jot": "{a.b.c:1}", "pretty": true}
```

Output:
```json
{
  "a": {
    "b": {
      "c": 1
    }
  }
}
```

### jot_compare

Input:
```json
{"json": "[{\"x\":1},{\"x\":2},{\"x\":3}]"}
```

Output:
```
=== Character/Byte Comparison ===

JSON (compact): 23 chars, 23 bytes
Jot (compact) : 11 chars, 11 bytes
  → 52.2% smaller

JSON (pretty) : 44 chars, 44 bytes
Jot (pretty)  : 23 chars, 23 bytes
  → 47.7% smaller
```

## Development

The server imports the Jot encoder/decoder from the parent project at `../encoding-formats/jot/jot.ts`.
