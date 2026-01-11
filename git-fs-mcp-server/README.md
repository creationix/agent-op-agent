# Git-FS MCP Server

A persistent, content-addressable filesystem for LLM agents with immutable snapshots, live reload, and visual feedback.

## Features

- **Persistent storage**: Objects stored in `db/obj/xx/xxx...`, refs in `db/refs/`
- **Immutable snapshots**: Every write creates a new root hash
- **Time travel**: Access any historical state by its root hash
- **Web server**: Preview content at `http://localhost:PORT/ref/path`
- **Screenshot tool**: Visual feedback loop - see what users see
- **HTTP caching**: ETag (content hash) and Last-Modified headers

## Best Practices for Agents

### The Development Loop

The most powerful pattern combines visual feedback with browser interaction:

```
1. gitfs_serve(port=0, inject=true)  # Start server with eval injection
2. gitfs_open(url)                   # Open in user's browser
3. gitfs_write_at(...)               # Write/update files
4. gitfs_screenshot(url)             # See the result (headless)
5. gitfs_eval(code)                  # Interact with live page
6. gitfs_console()                   # Check for errors
7. Iterate based on feedback
```

**Two feedback channels:**

- `gitfs_screenshot` - headless Chrome, see rendered output
- `gitfs_eval/console` - user's actual browser, full interaction

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

Write your files, start the server, and iterate:

```
# Write files
gitfs_write_at("refs/work/HEAD", "index.html", "<!DOCTYPE html>...")
gitfs_write_at("refs/work/HEAD", "style.css", "body { ... }")
gitfs_write_at("refs/work/HEAD", "app.js", "console.log('hello')")

# Start server and open browser
gitfs_serve(port=0, inject=true)  # Auto-injects eval-client.js
gitfs_open(url)                   # Opens in user's browser

# Make changes and reload on-demand
gitfs_write_at("refs/work/HEAD", "app.js", "// updated code...")
gitfs_eval("location.reload()")   # Reload when ready

# Verify
gitfs_screenshot(url)  # Visual verification (headless)
gitfs_console()        # Check for errors
```

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

### Browser Interaction (gitfs_eval)

Execute JavaScript directly in the user's browser. With `inject=true`, eval-client.js is automatically added to all HTML pages.

**Navigation:**

```
gitfs_eval("location.href = '/other-page/'")      # Navigate to path
gitfs_eval("history.back()")                       # Go back
gitfs_eval("location.reload()")                    # Reload current page
```

**Clicking and typing:**

```
gitfs_eval("document.querySelector('#btn').click()")
gitfs_eval(`
  const input = document.querySelector('#search');
  input.value = 'hello';
  input.dispatchEvent(new Event('input'));
`)
```

**Reading state:**

```
gitfs_eval("return document.title")
gitfs_eval("return document.querySelector('.result').textContent")
gitfs_eval("return Array.from(document.querySelectorAll('li')).map(el => el.textContent)")
```

**Async operations:**

```
gitfs_eval(`
  document.querySelector('#load-more').click();
  await new Promise(r => setTimeout(r, 500));
  return document.querySelectorAll('.item').length;
`)
```

**Console monitoring:**

```
gitfs_console()           # Get all logs/errors
gitfs_console(clear=true) # Get and clear the buffer
```

**Why this is powerful:**

- Runs in the user's actual browser (same context they're viewing)
- User sees interactions happen in real-time
- On-demand reload gives you control (no auto-reload surprises)
- Great for testing multi-page apps and user flows

### DOM Inspection (gitfs_dom)

Get a simplified view of the page structure without writing query code:

```
gitfs_dom()                          # Full body
gitfs_dom(selector="nav")            # Specific element
gitfs_dom(selector="main", depth=3)  # Shallow view
```

**Example output:**

```
<body>
  <header>
    <h1>Page Title</h1>
    <nav class="main-nav">
      <ul>
        <li><a href="/">Home</a>
        <li><a href="/about">About</a>
  <main id="content">
    <form>
      <input id="search" type="text" value="query...">
      <button type="submit">Search</button>
```

Shows: tag names, key attributes (id, class, href, src, type, name, value), direct text content (truncated). Skips script/style/svg.

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
| `gitfs_open` | Open URL (navigates if browser connected) |
| `gitfs_screenshot` | Take screenshot of URL (headless) |
| `gitfs_capture` | Screenshot from user's browser (Screen Capture API) |
| `gitfs_eval` | Execute JavaScript in browser |
| `gitfs_console` | Get console logs from browser |
| `gitfs_dom` | Get simplified DOM tree snapshot |

### Screenshot vs Capture

| Feature | `gitfs_screenshot` | `gitfs_capture` |
| ------- | ------------------ | ------------------ |
| Source | Headless Chrome | User's actual browser |
| State | Fresh page load | Current state (scroll, forms, etc.) |
| Permission | None | Prompts on first use + after reload |
| Speed | ~2s (new context) | ~100ms (if stream active) |

**When to use each:**

- `gitfs_screenshot` - Edit→reload→verify loop (no permission needed)
- `gitfs_capture` - See scroll position, form state, animations, or debug what user sees without reloading

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
3. **Use `inject=true`** to auto-inject eval-client.js into all HTML pages
4. **Screenshot after writes** to verify changes visually
5. **Use `gitfs_eval` with `return`** - code runs in async function, so `return document.title` not just `document.title`
6. **`gitfs_open` is smart** - navigates existing browser if connected, opens new tab if not
7. **Check response headers** in screenshot output to verify caching works
8. **The server must be restarted** after MCP server restarts to pick up changes
9. **refs/work/* refs auto-update** - other refs require manual `set_ref`
10. **Hash URLs are immutable** - get `Cache-Control: immutable` header for permanent caching
