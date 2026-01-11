# Tools I Wish Existed

Feedback from Claude while building web apps with git-fs MCP server.

## What Works Well

The current workflow is excellent for iterative web development:

1. **Two feedback channels** - Screenshot for visual verification, eval for live interaction
2. **On-demand reload** - `gitfs_eval("location.reload()")` is better than auto-reload (no surprises mid-edit)
3. **Smart navigation** - `gitfs_open` navigates existing browser or opens new tab as needed
4. **Multi-page testing** - Can click links, fill forms, navigate back/forward via eval
5. **Console monitoring** - Catch errors without user having to report them

The `inject=true` parameter is essential - it makes the workflow seamless.

---

## Implemented ✓

### `gitfs_eval` - Execute JavaScript in Browser
Uses WebSocket to send JavaScript to the user's actual browser for evaluation. Returns serialized results.

### `gitfs_console` - Capture Browser Console
Gets captured console.log/warn/error and uncaught exceptions from the connected browser.

### `gitfs_open` - Smart Browser Open
Opens URL in user's browser. If browser already connected via WebSocket, navigates existing tab instead of opening new one.

### Auto-injection (`inject=true`)
When starting server with `gitfs_serve(inject=true)`, automatically injects eval-client.js into all HTML pages.

### `gitfs_dom` - Get DOM Snapshot
Returns simplified DOM tree with tag names, key attributes (id, class, href), and text content. Great for understanding page structure.

### `gitfs_read_at` Returns Total Size

When reading partial content (e.g., first 50 lines), response now includes `total` field showing full size. Know if you're seeing everything or just a slice.

```json
{"type":"text", "hash":"...", "content":[...50 lines...], "total":956}
```

### `gitfs_glob` - Find Files by Pattern

Find files matching glob patterns: `**/*.js`, `src/**/*.{ts,tsx}`, `*.test.*`

### `gitfs_grep` - Search Content

Search for regex patterns across all files. Returns path, line number, content. Optional glob filter and context lines.

### `gitfs_edit_at` - Line-based Editing

Edit specific line ranges without rewriting entire file. Replace, insert, or delete lines.

### `gitfs_resize` - Window Resize

Resize browser window for responsive testing. Get current size or set new dimensions.

### `gitfs_logs` - Server Request Logs

Get HTTP request logs from the server. Shows which URLs were requested, response status, cache hits (304), and timing.

```python
gitfs_logs()        # Get recent requests
gitfs_logs(clear=true)  # Get and clear buffer
```

**Output format:**

```text
10:00:17 AM GET /refs/work/HEAD/encantis-ide/ → 200 (0.6ms)
10:00:23 AM GET /refs/work/HEAD/style.css → 304 (cached) (0.2ms)
```

**Use case:** Debugging caching issues - see if browser is hitting server or using stale cache. Essential for diagnosing "why isn't my change showing up?" problems.

### `gitfs_capture` + Chrome Extension

Screenshot from user's actual browser. Two modes:

1. **With extension (recommended)**: No prompts ever, survives reload/navigation
2. **Without extension**: Uses Screen Capture API, prompts on reload

Extension: `chrome-extension/` folder - uses content script to detect port, background service worker to capture via `chrome.tabs.captureVisibleTab()`.

---

## High Priority

### LSP Support for VFS Development

**Problem**: When developing code inside the VFS (e.g., building an IDE or complex app), there's no language server support. TypeScript errors, autocomplete, and refactoring tools aren't available. Had to move compiler development to the host filesystem to get proper IDE support.

**Proposed Solution**:
1. Bridge existing LSP servers (tsserver, etc.) to work with gitfs paths
2. Or: `gitfs_sync` tool to bidirectionally sync a gitfs path with a host directory for development

**Use case**: Building complex applications like Encantis IDE directly in gitfs with full TypeScript support.

---

### App Launcher Generation

**Problem**: After building multiple apps, there's no central index to navigate between them. Had to manually create an app launcher.

**Proposed API**:
```
gitfs_index(root, options?)  # Generate index.html listing all apps
```

**Returns**: Hash of generated index.html with links to all app directories.

**Auto-detect**: Scan for directories with index.html, extract title/description from HTML.

---

### Demo Mode / Automated Testing

**Problem**: Want to show off multiple apps or run automated tests, but have to manually navigate and click.

**Proposed Features**:

1. `gitfs_demo(script)` - Run a sequence of actions across apps
2. Self-healing: If page state is unexpected, navigate home and try next app
3. Randomized app selection for continuous demos
4. Pause between actions for visual feedback

**Script format**:

```javascript
{
  apps: [
    { url: 'app1/', actions: ['click #btn', 'wait 1000', 'type #input hello'] },
    { url: 'app2/', actions: ['click .compile', 'capture'] }
  ],
  loop: true,
  pauseBetweenApps: 3000
}
```

---

### `gitfs_import` - Import from Local Filesystem

**Problem**: Want to use existing files (CSS frameworks, images, data files) from the user's machine without manual copy-paste.

**Proposed API**:
```
gitfs_import(localPath, gitfsPath)  # One-time import
```

**Use case**: User has a local CSS framework or icon set. Import it directly into gitfs.

---

### `gitfs_network` - Capture Browser Network Requests

**Problem**: Can't see failed API calls, CORS errors, or slow requests. Have to guess why things aren't working.

**Note**: `gitfs_logs` captures requests TO the git-fs server. This tool would capture requests FROM the browser (to external APIs, CDNs, etc.).

**Proposed API**:
```
gitfs_network(clear?)
```

**Returns**:
- `requests`: Array of {url, method, status, duration, error?}
- `failed`: Requests that failed (4xx, 5xx, network error)
- `cors`: CORS-blocked requests

**Use case**: "The API call is failing" → check gitfs_network() → "Ah, CORS error on /api/data"

---

### `gitfs_perf` - Performance Metrics

**Problem**: Can't tell if the page is slow to render or has layout thrashing.

**Proposed API**:
```
gitfs_perf()
```

**Returns**:
- `timing`: Navigation timing (TTFB, FCP, LCP, etc.)
- `memory`: JS heap usage
- `longTasks`: Tasks over 50ms

**Use case**: After building a complex UI, check if it's actually performant.

---

## Medium Priority

### `gitfs_diff` - Compare Snapshots

**Problem**: Hard to explain what changed between versions.

**Proposed API**:
```
gitfs_diff(hash1, hash2, path?)
```

**Returns**: Unified diff output.

**Use case**: "Here's what I changed: [diff]"

---

### `gitfs_screenshot_diff` - Visual Diff

**Problem**: After making changes, hard to see exactly what changed visually. Have to compare screenshots manually.

**Proposed API**:
```
gitfs_screenshot_diff(url, beforeHash?)
```

**Returns**: Screenshot with changed regions highlighted, or side-by-side comparison.

**Use case**: "CSS change affected these areas: [highlighted screenshot]"

---

### `gitfs_import_npm` - Bundle NPM Package

**Problem**: Stuck with CDN links or manual inlining.

**Proposed API**:
```
gitfs_import_npm(package, version?, format?)
```

**Returns**: Hash of bundled JS file.

**Use case**: `gitfs_import_npm("chart.js")` → bundled chart.js ready to use.

---

### `gitfs_typescript` - Compile TypeScript

**Problem**: Would rather write TypeScript for type safety.

**Proposed API**:
```
gitfs_typescript(code, target?)
```

**Returns**: Compiled JavaScript.

---

### `gitfs_minify` - Minify Assets

**Problem**: Output is verbose, could be much smaller.

**Proposed API**:
```
gitfs_minify(hash, type)  # type: "js" | "css" | "html"
```

**Returns**: Hash of minified content.

---

## Nice to Have

### `gitfs_tailwind` - Process Tailwind CSS

**Problem**: Writing CSS is verbose.

**Proposed API**:
```
gitfs_tailwind(html)
```

**Returns**: Minimal CSS for Tailwind classes used.

---

### `gitfs_lighthouse` - Performance Audit

**Problem**: Can't assess accessibility, SEO.

**Proposed API**:
```
gitfs_lighthouse(url, categories?)
```

**Returns**: Scores and recommendations.

---

### `gitfs_html_validate` - Validate HTML

**Problem**: Might generate invalid HTML.

**Proposed API**:
```
gitfs_html_validate(hash)
```

**Returns**: Validation errors/warnings.

---

### `gitfs_a11y` - Accessibility Check

**Problem**: Can't verify screen reader compatibility, focus order, etc.

**Proposed API**:
```
gitfs_a11y(url)
```

**Returns**: WCAG violations with fix suggestions.

---

## Implementation Notes

Most of these leverage what we already have:

**Via eval-client.js (already connected):**

- ~~`gitfs_dom`~~ ✓ Implemented
- `gitfs_network` - Intercept fetch/XHR, store in window.__gitfs_network
- `gitfs_perf` - Read Performance API and PerformanceObserver data

**Via Bun built-ins:**

- `gitfs_import` - Read local files, write to gitfs
- `gitfs_import_npm` - Use Bun.build() to bundle packages
- `gitfs_typescript` - Bun transpiles TS natively
- `gitfs_minify` - Bun has built-in minification

**Via Playwright (already used for screenshots):**

- `gitfs_screenshot_diff` - Compare screenshots, highlight differences
- `gitfs_lighthouse` - Run Lighthouse via Chrome DevTools Protocol
- `gitfs_a11y` - Run axe-core or similar

**Via git storage:**

- `gitfs_diff` - Tree walk + text diff algorithm

The browser-based tools are lowest effort since eval-client.js already captures console output. Just extend to capture network requests and performance data.
