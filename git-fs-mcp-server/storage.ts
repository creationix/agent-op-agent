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

export class GitFS {
  // In-memory cache
  private objectCache = new Map<string, StoredObject>()
  private refCache = new Map<string, string>()
  private emptyTreeHash: string

  // SSE subscribers: ref -> Set of controllers
  private sseSubscribers = new Map<string, Set<ReadableStreamDefaultController>>()

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

  // Convenience: open + read
  readAt(root: string, path: string, start?: number, end?: number): unknown {
    const opened = this.openAt(root, path)
    if (!opened) return null
    return this.read(opened.hash, start, end)
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

  startServer(port: number): string {
    if (this.server) {
      this.server.stop()
    }

    // @ts-ignore - Bun global
    const srv = Bun.serve({
      port,
      fetch: (req: Request) => this.handleRequest(req)
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

    // Empty path - show available refs
    if (!pathname) {
      const refs = this.listRefs()
      const html = `<!DOCTYPE html>
<html><head><title>Git-FS</title><style>body{font-family:system-ui;padding:2rem}table{border-collapse:collapse}td,th{padding:0.5rem 1rem;text-align:left}tr:hover{background:#f5f5f5}</style></head>
<body>
<h1>Git-FS Server</h1>
<h2>Available Refs</h2>
<table>
<tr><th>Ref</th><th>Hash</th><th>Updated</th></tr>
${refs.map(r => `<tr><td><a href="/${r.ref}/">${r.ref}</a></td><td><code>${r.hash.slice(0, 8)}</code></td><td>${r.mtime ? new Date(r.mtime).toLocaleString() : '-'}</td></tr>`).join("\n")}
</table>
</body></html>`
      return new Response(html, { headers: { "Content-Type": "text/html" } })
    }

    // Parse root and path
    // Try to find the longest matching ref first
    let root: string | null = null
    let filePath = ""
    let lastModified: string | null = null

    // Check if it's a hash (64 hex chars at start)
    const hashMatch = pathname.match(/^([a-f0-9]{64})(?:\/(.*))?$/)
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
      return new Response(null, { status: 304, headers })
    }

    // Helper to build headers with optional Last-Modified
    const buildHeaders = (base: Record<string, string>) => {
      if (lastModified) base["Last-Modified"] = lastModified
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
        return new Response(obj.lines.join("\n"), {
          headers: buildHeaders({
            "Content-Type": "text/html; charset=utf-8",
            ETag: indexEtag
          })
        })
      }

      // Otherwise show directory listing (no ETag for dynamic content)
      const tree = this.loadObject(opened.hash) as TreeObject
      const html = `<!DOCTYPE html>
<html><head><title>Index of /${root}/${filePath}</title></head>
<body>
<h1>Index of /${root}/${filePath}</h1>
<ul>
${filePath ? `<li><a href="../">..</a></li>` : ""}
${tree.entries.map(e => {
  const slash = e.type === "tree" ? "/" : ""
  return `<li><a href="${e.name}${slash}">${e.name}${slash}</a></li>`
}).join("\n")}
</ul>
</body></html>`
      return new Response(html, { headers: { "Content-Type": "text/html" } })
    }

    if (opened.type === "text") {
      const obj = this.loadObject(opened.hash) as TextObject
      const content = obj.lines.join("\n")
      const mimeType = this.getMimeType(filePath)
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
