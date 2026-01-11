# Git-FS MCP Server

A persistent, content-addressable filesystem for LLM agents with immutable snapshots, live reload, and visual feedback.

## Features

- **Persistent storage**: Objects stored in `db/obj/xx/xxx...`, refs in `db/refs/`
- **Immutable snapshots**: Every write creates a new root hash
- **Time travel**: Access any historical state by its root hash
- **Live reload**: SSE endpoint for real-time updates when refs change
- **Web server**: Preview content at `http://localhost:PORT/ref/path`
- **Screenshot tool**: Visual feedback loop - see what users see
- **HTTP caching**: ETag (content hash) and Last-Modified headers

## Best Practices for Agents

### The Development Loop

The most powerful pattern is the visual feedback loop:

```
1. gitfs_serve(port=3456)           # Start web server
2. gitfs_write_at(...)              # Write/update files
3. gitfs_screenshot(url)            # See the result
4. Iterate based on what you see
```

This lets you build and refine web apps with direct visual feedback.

### Working with refs/work/HEAD

Use `refs/work/HEAD` as your primary working ref - it auto-updates on writes:

```
gitfs_write_at(root="refs/work/HEAD", path="src/app.js", content="...")
# refs/work/HEAD automatically points to the new root
```

### Using the Screenshot Tool

Take screenshots to verify your changes visually:

```
# Basic screenshot
gitfs_screenshot(url="http://localhost:3456/refs/work/HEAD/")

# Full page capture
gitfs_screenshot(url="...", fullPage=true)

# Custom viewport
gitfs_screenshot(url="...", width=375, height=667)  # Mobile
```

The screenshot tool returns:
- Response headers (ETag, Last-Modified, Content-Type)
- PNG image of the rendered page

### Building Web Apps

1. Write your HTML, CSS, JS files:
```
gitfs_write_at("refs/work/HEAD", "index.html", "<!DOCTYPE html>...")
gitfs_write_at("refs/work/HEAD", "style.css", "body { ... }")
gitfs_write_at("refs/work/HEAD", "app.js", "console.log('hello')")
```

2. Add auto-reload for live updates:
```
gitfs_write_at("refs/work/HEAD", "auto-reload.js", `
(function() {
  const match = location.pathname.match(/^\\/(refs\\/[^/]+\\/[^/]+)/);
  if (!match) return;
  const ref = match[1];
  let currentHash = null;

  function connect() {
    const es = new EventSource('/sse/' + ref);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (currentHash && currentHash !== data.hash) {
        location.reload();
      }
      currentHash = data.hash;
    };
    es.onerror = () => {
      es.close();
      setTimeout(connect, 1000);
    };
  }
  connect();
})();
`)
```

3. Start the server and take a screenshot:
```
gitfs_serve(port=3456)
gitfs_screenshot(url="http://localhost:3456/refs/work/HEAD/")
```

4. Iterate based on what you see!

### Writing Binary Files

Use `gitfs_write_bytes` for images, then reference by hash:

```
# Write binary content (base64 encoded)
hash = gitfs_write_bytes(base64="iVBORw0KGgo...")

# Add to tree by referencing the hash
gitfs_write_at("refs/work/HEAD", "image.png", "sha256:" + hash)
```

### Creating Snapshots

Save important states as named refs before making changes:

```
# Get current state
hash = gitfs_get_ref("refs/work/HEAD")

# Save as a tag before risky changes
gitfs_set_ref("refs/tags/before-refactor", hash)

# Now make changes safely - can always restore later
```

### Branching Workflows

Create feature branches for isolated work:

```
# Create branch from current HEAD
hash = gitfs_get_ref("refs/work/HEAD")
gitfs_set_ref("refs/heads/feature-x", hash)

# Work on feature (auto-updates this ref)
gitfs_write_at("refs/heads/feature-x", "new-file.js", "...")

# Merge by copying ref
hash = gitfs_get_ref("refs/heads/feature-x")
gitfs_set_ref("refs/work/HEAD", hash)
```

### Exporting Work

Export any snapshot as a zip file:

```
gitfs_export(root="refs/work/HEAD", outputDir="/path/to/desktop")
# Returns: /path/to/desktop/refs-work-HEAD-abc12345.zip
```

## Tools Reference

| Tool | Description |
|------|-------------|
| `gitfs_get_ref` | Get hash a ref points to |
| `gitfs_set_ref` | Set a ref to point to a hash |
| `gitfs_list_refs` | List refs with hash and mtime |
| `gitfs_delete_ref` | Delete a ref |
| `gitfs_open_at` | Get type/hash/metadata at path |
| `gitfs_read` | Read content by hash |
| `gitfs_read_at` | Open + read in one call |
| `gitfs_write_text` | Write text, get hash |
| `gitfs_write_bytes` | Write binary (base64), get hash |
| `gitfs_write_link` | Write symlink, get hash |
| `gitfs_write_at` | Write at path, rebuild tree |
| `gitfs_delete_at` | Delete at path, rebuild tree |
| `gitfs_export` | Export tree to zip file |
| `gitfs_serve` | Start web server |
| `gitfs_screenshot` | Take screenshot of URL |

## Storage Layout

```
gitfs-db/
├── obj/
│   ├── ab/
│   │   └── cdef123...  (object files)
│   └── ...
└── refs/
    ├── work/
    │   └── HEAD
    ├── heads/
    │   └── main
    └── tags/
        └── v1.0
```

## Web Server Features

### Endpoints

- `GET /` - List all refs with timestamps
- `GET /{ref}/` - Serve index.html or directory listing
- `GET /{ref}/path` - Serve file with proper MIME type
- `GET /{hash}/path` - Access by direct hash (immutable)
- `GET /sse/{ref}` - SSE stream for ref changes

### HTTP Caching

All file responses include:
- `ETag`: Content hash (e.g., `"abc123..."`) - perfect for caching
- `Last-Modified`: Ref's last update time

The server supports `If-None-Match` requests, returning `304 Not Modified` when content hasn't changed.

### SSE Live Reload

The `/sse/{ref}` endpoint sends:
- Initial hash on connect
- New hash whenever the ref is updated
- Heartbeat pings every 15 seconds

Clients can reload when the hash changes for instant updates.

## Important Notes for Agents

1. **Always start with `gitfs_serve`** before taking screenshots
2. **Use port 0** for auto-assignment if the default port is busy
3. **Screenshot after writes** to verify changes visually
4. **Check response headers** in screenshot output to verify caching works
5. **The server must be restarted** after MCP server restarts to pick up changes
6. **refs/work/* refs auto-update** - other refs require manual `set_ref`
