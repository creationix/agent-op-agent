/**
 * Git-based Filesystem Storage
 *
 * Content-addressable storage with immutable snapshots, trees, blobs, and refs.
 */

import { BinaryLike, createHash } from "crypto"
import archiver from "archiver"
import { createWriteStream, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync, statSync } from "fs"
import { join, dirname } from "path"

// Object types
export type ObjectType = "tree" | "text" | "bytes" | "symlink"

export interface TreeEntry {
  name: string
  type: ObjectType
  hash: string
}

export interface TreeObject {
  type: "tree"
  entries: TreeEntry[]
}

export interface TextObject {
  type: "text"
  lines: string[]
}

export interface BytesObject {
  type: "bytes"
  data: Uint8Array
}

export interface SymlinkObject {
  type: "symlink"
  target: string
}

export type StoredObject = TreeObject | TextObject | BytesObject | SymlinkObject

export interface OpenResult {
  type: ObjectType
  hash: string
  meta: number | string // tree=count, text=lines, bytes=size, symlink=target
}

// WebSocket message types
interface EvalRequest {
  type: "eval"
  id: string
  code: string
}

interface EvalResponse {
  type: "result"
  id: string
  success: boolean
  result?: unknown
  error?: string
}

interface PendingEval {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export class GitFS {
  // In-memory cache
  private objectCache = new Map<string, StoredObject>()
  private refCache = new Map<string, string>()
  private emptyTreeHash: string

  // SSE subscribers: ref -> Set of controllers
  private sseSubscribers = new Map<string, Set<ReadableStreamDefaultController>>()

  // WebSocket eval support (browser pages with eval-client.js)
  private wsClients = new Set<WebSocket>()
  private pendingEvals = new Map<string, PendingEval>()
  private evalIdCounter = 0

  // WebSocket extension support (Chrome extension for screenshots)
  private extClients = new Set<WebSocket>()
  private pendingCaptures = new Map<string, PendingEval>()
  private captureIdCounter = 0

  // Database path
  private dbPath: string

  constructor(dbPath: string = "./gitfs-db") {
    this.dbPath = dbPath

    // Ensure directories exist
    mkdirSync(join(dbPath, "obj"), { recursive: true })
    mkdirSync(join(dbPath, "refs", "work"), { recursive: true })
    mkdirSync(join(dbPath, "refs", "heads"), { recursive: true })
    mkdirSync(join(dbPath, "refs", "tags"), { recursive: true })

    // Load existing refs into cache
    this.loadRefs()

    // Create empty tree and default ref if needed
    this.emptyTreeHash = this.writeTree([])
    if (!this.refCache.has("refs/work/HEAD")) {
      this.saveRef("refs/work/HEAD", this.emptyTreeHash)
    }
  }

  // Persistence: Objects
  private objectPath(hash: string): string {
    return join(this.dbPath, "obj", hash.slice(0, 2), hash.slice(2))
  }

  private saveObject(hash: string, obj: StoredObject): void {
    const path = this.objectPath(hash)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(obj))
    this.objectCache.set(hash, obj)
  }

  private loadObject(hash: string): StoredObject | null {
    // Check cache first
    if (this.objectCache.has(hash)) {
      return this.objectCache.get(hash)!
    }

    // Load from disk
    const path = this.objectPath(hash)
    if (!existsSync(path)) return null

    try {
      const data = JSON.parse(readFileSync(path, "utf-8"))
      // Restore Uint8Array for bytes type
      if (data.type === "bytes" && data.data) {
        data.data = new Uint8Array(Object.values(data.data))
      }
      this.objectCache.set(hash, data)
      return data
    } catch {
      return null
    }
  }

  private hasObject(hash: string): boolean {
    if (this.objectCache.has(hash)) return true
    return existsSync(this.objectPath(hash))
  }

  // Persistence: Refs
  private refPath(ref: string): string {
    return join(this.dbPath, ref)
  }

  private saveRef(ref: string, hash: string): void {
    const path = this.refPath(ref)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, hash)
    this.refCache.set(ref, hash)
  }

  private loadRefs(dir: string = join(this.dbPath, "refs"), prefix: string = "refs"): void {
    if (!existsSync(dir)) return

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      const refName = `${prefix}/${entry.name}`

      if (entry.isDirectory()) {
        this.loadRefs(fullPath, refName)
      } else if (entry.isFile()) {
        try {
          const hash = readFileSync(fullPath, "utf-8").trim()
          this.refCache.set(refName, hash)
        } catch {
          // Skip invalid refs
        }
      }
    }
  }

  deleteRef(ref: string): boolean {
    const path = this.refPath(ref)
    if (!existsSync(path)) return false

    try {
      unlinkSync(path)
      const oldHash = this.refCache.get(ref)
      this.refCache.delete(ref)
      if (oldHash) {
        this.notifyRefChange(ref, "")
      }
      return true
    } catch {
      return false
    }
  }

  // Notify SSE subscribers when a ref changes
  private notifyRefChange(ref: string, newHash: string): void {
    const subscribers = this.sseSubscribers.get(ref)
    if (!subscribers) return

    const data = `data: ${JSON.stringify({ ref, hash: newHash })}\n\n`
    const deadControllers: ReadableStreamDefaultController[] = []

    for (const controller of subscribers) {
      try {
        controller.enqueue(new TextEncoder().encode(data))
      } catch {
        deadControllers.push(controller)
      }
    }

    // Clean up dead connections
    for (const controller of deadControllers) {
      subscribers.delete(controller)
    }
  }

  // Hash computation
  private computeHash(type: string, content: BinaryLike): string {
    return createHash("sha256").update(`${type}:`).update(content).digest("hex")
  }

  // Refs management
  getRef(ref: string): string | null {
    return this.refCache.get(ref) ?? null
  }

  setRef(ref: string, hash: string): void {
    if (!this.hasObject(hash)) {
      throw new Error(`Hash not found: ${hash}`)
    }
    const oldHash = this.refCache.get(ref)
    this.saveRef(ref, hash)
    if (oldHash !== hash) {
      this.notifyRefChange(ref, hash)
    }
  }

  listRefs(prefix?: string): Array<{ ref: string; hash: string; mtime: string }> {
    const all = Array.from(this.refCache.keys())
    const filtered = prefix ? all.filter(r => r.startsWith(prefix)) : all

    return filtered.map(ref => {
      const hash = this.refCache.get(ref) || ""
      let mtime = ""
      try {
        const stat = statSync(this.refPath(ref))
        mtime = stat.mtime.toISOString()
      } catch {
        // File might not exist yet
      }
      return { ref, hash, mtime }
    }).sort((a, b) => b.mtime.localeCompare(a.mtime)) // Most recent first
  }

  // Resolve hash or ref to hash
  private resolveRoot(root: string): string | null {
    // If it looks like a hash (64 hex chars), use directly
    if (/^[a-f0-9]{64}$/.test(root)) {
      return this.hasObject(root) ? root : null
    }
    // Otherwise treat as ref
    return this.refCache.get(root) ?? null
  }

  // Object reading
  getObject(hash: string): StoredObject | null {
    return this.loadObject(hash) ?? null
  }

  // Path resolution
  openAt(root: string, path: string): OpenResult | null {
    const rootHash = this.resolveRoot(root)
    if (!rootHash) return null

    // Handle empty path (root itself)
    if (!path || path === "/" || path === ".") {
      const obj = this.loadObject(rootHash)
      if (!obj) return null
      return this.makeOpenResult(rootHash, obj)
    }

    // Normalize and split path
    const segments = path.split("/").filter(s => s && s !== ".")

    let currentHash = rootHash
    for (const segment of segments) {
      const obj = this.loadObject(currentHash)
      if (!obj || obj.type !== "tree") return null

      const entry = obj.entries.find(e => e.name === segment)
      if (!entry) return null

      currentHash = entry.hash
    }

    const finalObj = this.loadObject(currentHash)
    if (!finalObj) return null
    return this.makeOpenResult(currentHash, finalObj)
  }

  private makeOpenResult(hash: string, obj: StoredObject): OpenResult {
    switch (obj.type) {
      case "tree":
        return { type: "tree", hash, meta: obj.entries.length }
      case "text":
        return { type: "text", hash, meta: obj.lines.length }
      case "bytes":
        return { type: "bytes", hash, meta: obj.data.length }
      case "symlink":
        return { type: "symlink", hash, meta: obj.target }
    }
  }

  // Read object content with optional range
  read(hash: string, start?: number, end?: number): unknown {
    const obj = this.loadObject(hash)
    if (!obj) return null

    switch (obj.type) {
      case "tree": {
        const entries = obj.entries.map(e => ({
          name: e.name,
          type: e.type,
          hash: e.hash
        }))
        return this.applyRange(entries, start, end)
      }
      case "text": {
        return this.applyRange(obj.lines, start, end)
      }
      case "bytes": {
        const slice = this.applyRange(Array.from(obj.data), start, end) as number[]
        return Buffer.from(slice).toString("base64")
      }
      case "symlink": {
        return obj.target
      }
    }
  }

  private applyRange<T>(arr: T[], start?: number, end?: number): T[] {
    const s = start ?? 0
    const e = end ?? arr.length
    return arr.slice(s, e)
  }

  // Convenience: open + read (returns content + total for partial reads)
  readAt(root: string, path: string, start?: number, end?: number): { type: ObjectType; hash: string; content: unknown; total: number | string } | null {
    const opened = this.openAt(root, path)
    if (!opened) return null
    const content = this.read(opened.hash, start, end)
    return {
      type: opened.type,
      hash: opened.hash,
      content,
      total: opened.meta  // tree=entry count, text=line count, bytes=byte count, symlink=target
    }
  }

  // Find files matching a glob pattern
  glob(root: string, pattern: string): string[] {
    const rootHash = this.resolveRoot(root)
    if (!rootHash) return []

    const results: string[] = []
    this.globWalk(rootHash, "", pattern, results)
    return results.sort()
  }

  private globWalk(treeHash: string, prefix: string, pattern: string, results: string[]): void {
    const obj = this.loadObject(treeHash)
    if (!obj || obj.type !== "tree") return

    for (const entry of obj.entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.type === "tree") {
        // Always recurse into directories for ** patterns
        this.globWalk(entry.hash, fullPath, pattern, results)
      } else {
        // Match file against pattern
        if (this.matchGlob(fullPath, pattern)) {
          results.push(fullPath)
        }
      }
    }
  }

  private matchGlob(path: string, pattern: string): boolean {
    // Convert glob to regex
    // ** matches any path segments, * matches within segment, ? matches single char
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")  // Escape regex chars except * and ?
      .replace(/\*\*/g, "{{GLOBSTAR}}")       // Temp placeholder for **
      .replace(/\*/g, "[^/]*")                // * matches non-slash
      .replace(/\?/g, "[^/]")                 // ? matches single non-slash
      .replace(/{{GLOBSTAR}}/g, ".*")         // ** matches anything
      .replace(/\{([^}]+)\}/g, (_, alts) => `(${alts.split(",").join("|")})`)  // {a,b} alternation

    const regex = new RegExp(`^${regexStr}$`)
    return regex.test(path)
  }

  // Search for content matching a pattern
  grep(root: string, pattern: string, options: { glob?: string; maxResults?: number; contextLines?: number } = {}): Array<{ path: string; line: number; content: string; context?: string[] }> {
    const rootHash = this.resolveRoot(root)
    if (!rootHash) return []

    const { glob: globPattern, maxResults = 100, contextLines = 0 } = options
    const results: Array<{ path: string; line: number; content: string; context?: string[] }> = []
    const regex = new RegExp(pattern)

    this.grepWalk(rootHash, "", regex, globPattern, maxResults, contextLines, results)
    return results
  }

  private grepWalk(
    treeHash: string,
    prefix: string,
    regex: RegExp,
    globPattern: string | undefined,
    maxResults: number,
    contextLines: number,
    results: Array<{ path: string; line: number; content: string; context?: string[] }>
  ): void {
    if (results.length >= maxResults) return

    const obj = this.loadObject(treeHash)
    if (!obj || obj.type !== "tree") return

    for (const entry of obj.entries) {
      if (results.length >= maxResults) return

      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.type === "tree") {
        this.grepWalk(entry.hash, fullPath, regex, globPattern, maxResults, contextLines, results)
      } else if (entry.type === "text") {
        // Check glob filter
        if (globPattern && !this.matchGlob(fullPath, globPattern)) continue

        const textObj = this.loadObject(entry.hash) as TextObject
        if (!textObj) continue

        for (let i = 0; i < textObj.lines.length && results.length < maxResults; i++) {
          if (regex.test(textObj.lines[i])) {
            const result: { path: string; line: number; content: string; context?: string[] } = {
              path: fullPath,
              line: i,
              content: textObj.lines[i]
            }

            if (contextLines > 0) {
              const start = Math.max(0, i - contextLines)
              const end = Math.min(textObj.lines.length, i + contextLines + 1)
              result.context = textObj.lines.slice(start, end)
            }

            results.push(result)
          }
        }
      }
    }
  }

  // Edit lines in a file (replace, insert, or delete)
  editAt(root: string, path: string, start: number, end: number, content: string): string {
    const rootHash = this.resolveRoot(root)
    if (!rootHash) throw new Error(`Root not found: ${root}`)

    const opened = this.openAt(root, path)
    if (!opened) throw new Error(`File not found: ${path}`)
    if (opened.type !== "text") throw new Error(`Cannot edit non-text file: ${path}`)

    const obj = this.loadObject(opened.hash) as TextObject
    const lines = [...obj.lines]

    // Parse new content into lines (empty string = delete)
    const newLines = content === "" ? [] : content.split("\n")

    // Replace lines[start..end) with newLines
    lines.splice(start, end - start, ...newLines)

    // Write the modified content
    const newContent = lines.join("\n")
    return this.writeAt(root, path, newContent)
  }

  // Write objects
  writeText(content: string): string {
    const lines = content.split("\n")
    const hash = this.computeHash("text", content)

    if (!this.hasObject(hash)) {
      this.saveObject(hash, { type: "text", lines })
    }
    return hash
  }

  writeBytes(base64: string): string {
    const data = new Uint8Array(Buffer.from(base64, "base64"))
    const hash = this.computeHash("bytes", data)

    if (!this.hasObject(hash)) {
      this.saveObject(hash, { type: "bytes", data })
    }
    return hash
  }

  writeLink(target: string): string {
    const hash = this.computeHash("symlink", target)

    if (!this.hasObject(hash)) {
      this.saveObject(hash, { type: "symlink", target })
    }
    return hash
  }

  writeTree(entries: TreeEntry[]): string {
    // Sort entries by name for canonical hash
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name))
    const canonical = JSON.stringify(sorted)
    const hash = this.computeHash("tree", canonical)

    if (!this.hasObject(hash)) {
      this.saveObject(hash, { type: "tree", entries: sorted })
    }
    return hash
  }

  // Write at path - creates/updates file and rebuilds tree structure
  writeAt(root: string, path: string, content: string): string {
    const rootHash = this.resolveRoot(root)
    const isWorkRef = root.startsWith("refs/work/")

    // Determine content hash
    let contentHash: string
    if (content.startsWith("sha256:")) {
      contentHash = content.slice(7)
      if (!this.hasObject(contentHash)) {
        throw new Error(`Referenced hash not found: ${contentHash}`)
      }
    } else {
      // Write as text blob
      contentHash = this.writeText(content)
    }

    // Normalize path segments
    const segments = path.split("/").filter(s => s && s !== ".")
    if (segments.length === 0) {
      throw new Error("Cannot write to root path")
    }

    // Recursively build new tree structure
    const newRootHash = this.writeAtPath(rootHash, segments, contentHash)

    // Auto-update work refs
    if (isWorkRef) {
      const oldHash = this.refCache.get(root)
      this.saveRef(root, newRootHash)
      if (oldHash !== newRootHash) {
        this.notifyRefChange(root, newRootHash)
      }
    }

    return newRootHash
  }

  private writeAtPath(currentHash: string | null, segments: string[], contentHash: string): string {
    const [head, ...rest] = segments

    if (rest.length === 0) {
      // Leaf: insert/update entry in current tree
      const currentTree = currentHash ? this.loadObject(currentHash) as TreeObject | null : null
      const entries: TreeEntry[] = currentTree?.type === "tree"
        ? currentTree.entries.filter(e => e.name !== head)
        : []

      // Get type from content
      const contentObj = this.loadObject(contentHash)!
      entries.push({ name: head, type: contentObj.type, hash: contentHash })

      return this.writeTree(entries)
    }

    // Non-leaf: recurse into subtree
    const currentTree = currentHash ? this.loadObject(currentHash) as TreeObject | null : null
    const existingEntry = currentTree?.type === "tree"
      ? currentTree.entries.find(e => e.name === head)
      : null

    const subtreeHash = existingEntry?.type === "tree" ? existingEntry.hash : null
    const newSubtreeHash = this.writeAtPath(subtreeHash, rest, contentHash)

    // Rebuild current tree with updated subtree
    const entries: TreeEntry[] = currentTree?.type === "tree"
      ? currentTree.entries.filter(e => e.name !== head)
      : []
    entries.push({ name: head, type: "tree", hash: newSubtreeHash })

    return this.writeTree(entries)
  }

  // Delete at path
  deleteAt(root: string, path: string): string | null {
    const rootHash = this.resolveRoot(root)
    if (!rootHash) return null

    const isWorkRef = root.startsWith("refs/work/")

    const segments = path.split("/").filter(s => s && s !== ".")
    if (segments.length === 0) {
      throw new Error("Cannot delete root path")
    }

    const newRootHash = this.deleteAtPath(rootHash, segments)
    if (newRootHash === null) return null

    // Auto-update work refs
    if (isWorkRef) {
      const oldHash = this.refCache.get(root)
      this.saveRef(root, newRootHash)
      if (oldHash !== newRootHash) {
        this.notifyRefChange(root, newRootHash)
      }
    }

    return newRootHash
  }

  private deleteAtPath(currentHash: string, segments: string[]): string | null {
    const currentObj = this.loadObject(currentHash)
    if (!currentObj || currentObj.type !== "tree") return null

    const [head, ...rest] = segments
    const entry = currentObj.entries.find(e => e.name === head)
    if (!entry) return null // Nothing to delete

    if (rest.length === 0) {
      // Remove this entry
      const newEntries = currentObj.entries.filter(e => e.name !== head)
      return this.writeTree(newEntries)
    }

    // Recurse into subtree
    if (entry.type !== "tree") return null
    const newSubtreeHash = this.deleteAtPath(entry.hash, rest)
    if (newSubtreeHash === null) return null

    // Rebuild with updated subtree
    const newEntries = currentObj.entries
      .filter(e => e.name !== head)
      .concat([{ name: head, type: "tree", hash: newSubtreeHash }])

    return this.writeTree(newEntries)
  }

  // Debug: get stats
  stats(): { objects: number; refs: number } {
    return {
      objects: this.objectCache.size,
      refs: this.refCache.size
    }
  }

  // Web server
  private server: { stop(): void; port: number } | null = null
  private serverPort: number = 0
  private injectEvalClient: boolean = false

  startServer(port: number, inject: boolean = false): string {
    if (this.server) {
      this.server.stop()
    }
    this.injectEvalClient = inject

    const self = this

    // @ts-ignore - Bun global
    const srv = Bun.serve({
      port,
      fetch(req: Request, server: { upgrade: (req: Request) => boolean }) {
        const url = new URL(req.url)

        // Handle WebSocket upgrade for /ws/eval (browser pages)
        if (url.pathname === "/ws/eval") {
          const success = server.upgrade(req, { data: { type: "eval" } })
          if (success) return undefined
          return new Response("WebSocket upgrade failed", { status: 500 })
        }

        // Handle WebSocket upgrade for /ws/ext (Chrome extension)
        if (url.pathname === "/ws/ext") {
          const success = server.upgrade(req, { data: { type: "ext" } })
          if (success) return undefined
          return new Response("WebSocket upgrade failed", { status: 500 })
        }

        return self.handleRequest(req)
      },
      websocket: {
        open(ws: WebSocket & { data?: { type: string } }) {
          const wsType = ws.data?.type || "eval"
          if (wsType === "ext") {
            self.extClients.add(ws)
            ws.send(JSON.stringify({ type: "connected", client: "extension" }))
            console.error(`[gitfs] Extension connected (${self.extClients.size} total)`)
          } else {
            self.wsClients.add(ws)
            ws.send(JSON.stringify({ type: "connected", clients: self.wsClients.size }))
          }
        },
        message(ws: WebSocket & { data?: { type: string } }, message: string | Buffer) {
          const wsType = ws.data?.type || "eval"
          try {
            const data = JSON.parse(message.toString())

            if (wsType === "ext") {
              // Handle extension messages (capture, resize, get-size results)
              if ((data.type === "capture-result" || data.type === "resize-result" || data.type === "get-size-result") && data.id) {
                const pending = self.pendingCaptures.get(data.id)
                if (pending) {
                  clearTimeout(pending.timeout)
                  self.pendingCaptures.delete(data.id)
                  if (data.error) {
                    pending.reject(new Error(data.error))
                  } else {
                    pending.resolve(data)
                  }
                }
              }
            } else {
              // Handle eval client messages
              if (data.type === "result" && data.id) {
                const pending = self.pendingEvals.get(data.id)
                if (pending) {
                  clearTimeout(pending.timeout)
                  self.pendingEvals.delete(data.id)
                  if (data.success) {
                    pending.resolve(data.result)
                  } else {
                    pending.reject(new Error(data.error || "Unknown error"))
                  }
                }
              }
            }
          } catch {
            // Ignore malformed messages
          }
        },
        close(ws: WebSocket & { data?: { type: string } }) {
          const wsType = ws.data?.type || "eval"
          if (wsType === "ext") {
            self.extClients.delete(ws)
            console.error(`[gitfs] Extension disconnected (${self.extClients.size} remaining)`)
          } else {
            self.wsClients.delete(ws)
          }
        }
      }
    })
    this.server = srv
    this.serverPort = srv.port
    return `http://localhost:${this.serverPort}`
  }

  stopServer(): void {
    if (this.server) {
      this.server.stop()
      this.server = null
      this.serverPort = 0
    }
  }

  getServerUrl(): string | null {
    return this.server ? `http://localhost:${this.serverPort}` : null
  }

  // Inject eval-client.js into HTML content (if enabled)
  private maybeInjectEvalClient(html: string): string {
    if (!this.injectEvalClient) return html
    const script = '<script src="/eval-client.js"></script>'
    if (html.includes('</body>')) {
      return html.replace('</body>', `${script}</body>`)
    }
    return html + script
  }

  // Evaluate JavaScript in connected browser
  async evalInBrowser(code: string, timeoutMs: number = 30000): Promise<unknown> {
    if (this.wsClients.size === 0) {
      throw new Error("No browser connected. Include eval-client.js in your page and open it in a browser.")
    }

    const id = `eval-${++this.evalIdCounter}`
    const request: EvalRequest = { type: "eval", id, code }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingEvals.delete(id)
        reject(new Error(`Eval timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pendingEvals.set(id, { resolve, reject, timeout })

      // Send to all connected clients (first one to respond wins)
      const message = JSON.stringify(request)
      for (const ws of this.wsClients) {
        try {
          ws.send(message)
        } catch {
          // Client might have disconnected
        }
      }
    })
  }

  // Get connected browser count
  getConnectedBrowsers(): number {
    return this.wsClients.size
  }

  // Get connected extension count
  getConnectedExtensions(): number {
    return this.extClients.size
  }

  // Capture screenshot via Chrome extension
  async captureViaExtension(timeout: number = 10000): Promise<{ width: number; height: number; url: string; title: string; data: string }> {
    if (this.extClients.size === 0) {
      throw new Error("No extension connected. Install the Git-FS Capture extension and reload.")
    }

    const id = `cap-${++this.captureIdCounter}`

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingCaptures.delete(id)
        reject(new Error("Extension capture timed out"))
      }, timeout)

      this.pendingCaptures.set(id, { resolve, reject, timeout: timeoutHandle })

      // Send capture request to all connected extensions (first to respond wins)
      for (const client of this.extClients) {
        try {
          client.send(JSON.stringify({ type: "capture", id }))
        } catch {
          // Client might have disconnected
        }
      }
    })
  }

  // Resize browser window via Chrome extension
  async resizeViaExtension(width: number, height: number, timeout: number = 5000): Promise<{ width: number; height: number }> {
    if (this.extClients.size === 0) {
      throw new Error("No extension connected. Install the Git-FS Capture extension and reload.")
    }

    const id = `rsz-${++this.captureIdCounter}`

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingCaptures.delete(id)
        reject(new Error("Extension resize timed out"))
      }, timeout)

      this.pendingCaptures.set(id, { resolve: resolve as (result: unknown) => void, reject, timeout: timeoutHandle })

      for (const client of this.extClients) {
        try {
          client.send(JSON.stringify({ type: "resize", id, width, height }))
        } catch {
          // Client might have disconnected
        }
      }
    })
  }

  // Get browser window size via Chrome extension
  async getSizeViaExtension(timeout: number = 5000): Promise<{ width: number; height: number; left: number; top: number; state: string }> {
    if (this.extClients.size === 0) {
      throw new Error("No extension connected. Install the Git-FS Capture extension and reload.")
    }

    const id = `gsz-${++this.captureIdCounter}`

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingCaptures.delete(id)
        reject(new Error("Extension get-size timed out"))
      }, timeout)

      this.pendingCaptures.set(id, { resolve: resolve as (result: unknown) => void, reject, timeout: timeoutHandle })

      for (const client of this.extClients) {
        try {
          client.send(JSON.stringify({ type: "get-size", id }))
        } catch {
          // Client might have disconnected
        }
      }
    })
  }

  private handleSSE(ref: string): Response {
    // Check if ref exists
    if (!this.refCache.has(ref)) {
      return new Response(`Ref not found: ${ref}`, { status: 404 })
    }

    const self = this
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null

    const stream = new ReadableStream({
      start(controller) {
        // Add to subscribers
        if (!self.sseSubscribers.has(ref)) {
          self.sseSubscribers.set(ref, new Set())
        }
        self.sseSubscribers.get(ref)!.add(controller)

        // Send initial hash
        const hash = self.refCache.get(ref)
        const data = `data: ${JSON.stringify({ ref, hash })}\n\n`
        controller.enqueue(new TextEncoder().encode(data))

        // Send heartbeat every 15 seconds to keep connection alive
        heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"))
          } catch {
            if (heartbeatInterval) clearInterval(heartbeatInterval)
          }
        }, 15000)
      },
      cancel(controller) {
        // Clean up heartbeat
        if (heartbeatInterval) clearInterval(heartbeatInterval)
        // Remove from subscribers
        const subscribers = self.sseSubscribers.get(ref)
        if (subscribers) {
          subscribers.delete(controller)
        }
      }
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      }
    })
  }

  private handleRequest(req: Request): Response {
    const url = new URL(req.url)
    let pathname = decodeURIComponent(url.pathname)

    // Remove leading slash
    if (pathname.startsWith("/")) {
      pathname = pathname.slice(1)
    }

    // Handle SSE subscriptions: /sse/{ref}
    if (pathname.startsWith("sse/")) {
      const ref = pathname.slice(4) // Remove "sse/" prefix
      return this.handleSSE(ref)
    }

    // Serve eval-client.js from the package directory
    if (pathname === "eval-client.js") {
      try {
        const clientScript = readFileSync(join(import.meta.dir, "eval-client.js"), "utf-8")
        return new Response(clientScript, {
          headers: { "Content-Type": "text/javascript; charset=utf-8" }
        })
      } catch {
        return new Response("eval-client.js not found", { status: 404 })
      }
    }

    // Empty path - show available refs
    if (!pathname) {
      const refs = this.listRefs()
      const html = this.maybeInjectEvalClient(`<!DOCTYPE html>
<html><head><title>Git-FS</title><style>
body{font-family:system-ui;padding:2rem;background:#fff;color:#111}
table{border-collapse:collapse}
td,th{padding:0.5rem 1rem;text-align:left}
tr:hover{background:#f5f5f5}
a{color:#0066cc}
code{background:#f0f0f0;padding:0.2rem 0.4rem;border-radius:3px}
@media(prefers-color-scheme:dark){
  body{background:#1a1a1a;color:#e0e0e0}
  tr:hover{background:#2a2a2a}
  a{color:#6db3f2}
  code{background:#2a2a2a}
}
</style></head>
<body>
<h1>Git-FS Server</h1>
<h2>Available Refs</h2>
<table>
<tr><th>Ref</th><th>Hash</th><th>Updated</th></tr>
${refs.map(r => `<tr><td><a href="/${r.ref}/">${r.ref}</a></td><td><code>${r.hash.slice(0, 8)}</code></td><td>${r.mtime ? new Date(r.mtime).toLocaleString() : '-'}</td></tr>`).join("\n")}
</table>
</body></html>`)
      return new Response(html, { headers: { "Content-Type": "text/html" } })
    }

    // Parse root and path
    // Try to find the longest matching ref first
    let root: string | null = null
    let filePath = ""
    let lastModified: string | null = null

    // Check if it's a hash (64 hex chars at start) - these are immutable
    const hashMatch = pathname.match(/^([a-f0-9]{64})(?:\/(.*))?$/)
    const isImmutable = !!hashMatch
    if (hashMatch) {
      root = hashMatch[1]
      filePath = hashMatch[2] || ""
    } else {
      // Try matching refs (longest first)
      const refs = this.listRefs().sort((a, b) => b.ref.length - a.ref.length)
      for (const { ref, mtime } of refs) {
        if (pathname === ref || pathname.startsWith(ref + "/")) {
          root = ref
          filePath = pathname.slice(ref.length + 1)
          lastModified = mtime ? new Date(mtime).toUTCString() : null
          break
        }
      }
    }

    if (!root) {
      return new Response("Not Found: No matching root or ref", { status: 404 })
    }

    // Try to open the path
    const opened = this.openAt(root, filePath || "/")
    if (!opened) {
      return new Response(`Not Found: ${filePath || "/"}`, { status: 404 })
    }

    // ETag support - use content hash as strong ETag
    const etag = `"${opened.hash}"`
    const ifNoneMatch = req.headers.get("If-None-Match")
    if (ifNoneMatch === etag) {
      const headers: Record<string, string> = { ETag: etag }
      if (lastModified) headers["Last-Modified"] = lastModified
      if (isImmutable) headers["Cache-Control"] = "public, max-age=31536000, immutable"
      return new Response(null, { status: 304, headers })
    }

    // Helper to build headers with optional Last-Modified and immutable caching
    const buildHeaders = (base: Record<string, string>) => {
      if (lastModified) base["Last-Modified"] = lastModified
      if (isImmutable) base["Cache-Control"] = "public, max-age=31536000, immutable"
      return base
    }

    // Handle based on type
    if (opened.type === "tree") {
      // Try index.html first
      const indexOpened = this.openAt(root, filePath ? `${filePath}/index.html` : "index.html")
      if (indexOpened && indexOpened.type === "text") {
        const indexEtag = `"${indexOpened.hash}"`
        if (ifNoneMatch === indexEtag) {
          return new Response(null, { status: 304, headers: buildHeaders({ ETag: indexEtag }) })
        }
        const obj = this.loadObject(indexOpened.hash) as TextObject
        const content = this.maybeInjectEvalClient(obj.lines.join("\n"))
        return new Response(content, {
          headers: buildHeaders({
            "Content-Type": "text/html; charset=utf-8",
            ETag: indexEtag
          })
        })
      }

      // Otherwise show directory listing (no ETag for dynamic content)
      const tree = this.loadObject(opened.hash) as TreeObject
      const html = this.maybeInjectEvalClient(`<!DOCTYPE html>
<html><head><title>Index of /${root}/${filePath}</title><style>
body{font-family:system-ui;padding:2rem;background:#fff;color:#111}
ul{list-style:none;padding:0}
li{padding:0.3rem 0}
a{color:#0066cc;text-decoration:none}
a:hover{text-decoration:underline}
@media(prefers-color-scheme:dark){
  body{background:#1a1a1a;color:#e0e0e0}
  a{color:#6db3f2}
}
</style></head>
<body>
<h1>Index of /${root}/${filePath}</h1>
<ul>
${filePath ? `<li><a href="../">..</a></li>` : ""}
${tree.entries.map(e => {
  const slash = e.type === "tree" ? "/" : ""
  return `<li><a href="${e.name}${slash}">${e.name}${slash}</a></li>`
}).join("\n")}
</ul>
</body></html>`)
      return new Response(html, { headers: { "Content-Type": "text/html" } })
    }

    if (opened.type === "text") {
      const obj = this.loadObject(opened.hash) as TextObject
      let content = obj.lines.join("\n")
      const mimeType = this.getMimeType(filePath)
      // Inject eval client into HTML pages
      if (mimeType === "text/html") {
        content = this.maybeInjectEvalClient(content)
      }
      return new Response(content, {
        headers: buildHeaders({
          "Content-Type": `${mimeType}; charset=utf-8`,
          ETag: etag
        })
      })
    }

    if (opened.type === "bytes") {
      const obj = this.loadObject(opened.hash) as BytesObject
      const mimeType = this.getMimeType(filePath)
      return new Response(Buffer.from(obj.data), {
        headers: buildHeaders({
          "Content-Type": mimeType,
          ETag: etag
        })
      })
    }

    if (opened.type === "symlink") {
      // Redirect to target
      const obj = this.loadObject(opened.hash) as SymlinkObject
      return Response.redirect(obj.target, 302)
    }

    return new Response("Unknown type", { status: 500 })
  }

  private getMimeType(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() || ""
    const mimeTypes: Record<string, string> = {
      html: "text/html",
      htm: "text/html",
      css: "text/css",
      js: "text/javascript",
      mjs: "text/javascript",
      json: "application/json",
      xml: "application/xml",
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      ico: "image/x-icon",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      otf: "font/otf",
      pdf: "application/pdf",
      zip: "application/zip",
      txt: "text/plain",
      md: "text/markdown",
      ts: "text/typescript",
      tsx: "text/typescript",
      jsx: "text/javascript",
    }
    return mimeTypes[ext] || "application/octet-stream"
  }

  // Export tree to zip file
  async exportZip(root: string, outputDir: string): Promise<string> {
    const rootHash = this.resolveRoot(root)
    if (!rootHash) {
      throw new Error(`Root not found: ${root}`)
    }

    const rootObj = this.loadObject(rootHash)
    if (!rootObj || rootObj.type !== "tree") {
      throw new Error("Root must be a tree")
    }

    // Generate filename
    const shortHash = rootHash.slice(0, 8)
    let filename: string
    if (/^[a-f0-9]{64}$/.test(root)) {
      filename = `gitfs-${shortHash}.zip`
    } else {
      // Sanitize ref name for filename
      const sanitizedRef = root.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-")
      filename = `${sanitizedRef}-${shortHash}.zip`
    }

    const fullPath = `${outputDir}/${filename}`

    // Collect all files recursively
    const files: Array<{ path: string; content: Uint8Array }> = []
    this.collectFiles(rootHash, "", files)

    // Create zip using archiver
    return new Promise((resolve, reject) => {
      const output = createWriteStream(fullPath)
      const archive = archiver("zip", { zlib: { level: 9 } })

      output.on("close", () => resolve(fullPath))
      archive.on("error", reject)

      archive.pipe(output)

      for (const file of files) {
        archive.append(Buffer.from(file.content), { name: file.path })
      }

      archive.finalize()
    })
  }

  private collectFiles(treeHash: string, prefix: string, files: Array<{ path: string; content: Uint8Array }>): void {
    const tree = this.loadObject(treeHash) as TreeObject
    if (!tree || tree.type !== "tree") return

    for (const entry of tree.entries) {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name
      const obj = this.loadObject(entry.hash)
      if (!obj) continue

      switch (obj.type) {
        case "tree":
          this.collectFiles(entry.hash, entryPath, files)
          break
        case "text":
          files.push({ path: entryPath, content: new TextEncoder().encode(obj.lines.join("\n")) })
          break
        case "bytes":
          files.push({ path: entryPath, content: obj.data })
          break
        case "symlink":
          // Store symlink as a text file with .symlink extension noting the target
          files.push({ path: `${entryPath}.symlink`, content: new TextEncoder().encode(obj.target) })
          break
      }
    }
  }
}

// Singleton instance
export const gitfs = new GitFS()
