import path from "node:path"

export type VfsStat = {
  isDirectory: boolean
  isExecutable: boolean
  size: number
  mtimeMs: number
  mode: number
}

export type VfsEntry = {
  name: string
  path: string
  stat: VfsStat
}

type VfsNode =
  | {
      kind: "dir"
      mtimeMs: number
      mode: number
    }
  | {
      kind: "file"
      content: Buffer
      mtimeMs: number
      mode: number
    }

export type VfsStore = {
  home: string
  resolvePath: (rawPath: string, cwd?: string) => string
  stat: (targetPath: string) => VfsStat | null
  readFile: (targetPath: string) => Buffer | null
  writeFile: (targetPath: string, content: Buffer, options?: { mode?: number }) => void
  mkdir: (targetPath: string, options?: { recursive?: boolean }) => boolean
  readdir: (targetPath: string) => ReadonlyArray<VfsEntry>
  remove: (targetPath: string) => boolean
  rename: (oldPath: string, newPath: string) => boolean
}

const DEFAULT_DIR_MODE = 0o40755
const DEFAULT_FILE_MODE = 0o100644
const DEFAULT_EXEC_MODE = 0o100755

const normalizePosix = (input: string): string => {
  const normalized = path.posix.normalize(input)
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1)
  }
  return normalized
}

const toStat = (node: VfsNode): VfsStat => {
  if (node.kind === "dir") {
    return {
      isDirectory: true,
      isExecutable: true,
      size: 4096,
      mtimeMs: node.mtimeMs,
      mode: node.mode,
    }
  }
  return {
    isDirectory: false,
    isExecutable: (node.mode & 0o111) !== 0,
    size: node.content.byteLength,
    mtimeMs: node.mtimeMs,
    mode: node.mode,
  }
}

export const createVfsStore = (options: { home: string }): VfsStore => {
  const home = normalizePosix(options.home)
  const nodes = new Map<string, VfsNode>()

  const ensureDirChain = (dirPath: string): void => {
    const parts = normalizePosix(dirPath).split("/").filter(Boolean)
    parts.reduce((acc, part) => {
      const next = `${acc}/${part}`
      if (!nodes.has(next)) {
        nodes.set(next, { kind: "dir", mtimeMs: Date.now(), mode: DEFAULT_DIR_MODE })
      }
      return next
    }, "")
    if (!nodes.has("/")) {
      nodes.set("/", { kind: "dir", mtimeMs: Date.now(), mode: DEFAULT_DIR_MODE })
    }
  }

  ensureDirChain(home)

  const resolvePath = (rawPath: string, cwd?: string): string => {
    const trimmed = rawPath.trim()
    if (trimmed === "" || trimmed === "." || trimmed === "~") {
      return cwd ? normalizePosix(cwd) : home
    }
    if (trimmed.startsWith("~/")) {
      return normalizePosix(`${home}/${trimmed.slice(2)}`)
    }
    if (trimmed.startsWith("/")) {
      return normalizePosix(trimmed)
    }
    const base = cwd ? normalizePosix(cwd) : home
    return normalizePosix(`${base}/${trimmed}`)
  }

  const stat = (targetPath: string): VfsStat | null => {
    const resolved = resolvePath(targetPath)
    const node = nodes.get(resolved)
    return node ? toStat(node) : null
  }

  const readFile = (targetPath: string): Buffer | null => {
    const resolved = resolvePath(targetPath)
    const node = nodes.get(resolved)
    if (!node || node.kind !== "file") {
      return null
    }
    return Buffer.from(node.content)
  }

  const writeFile = (
    targetPath: string,
    content: Buffer,
    writeOptions?: { mode?: number },
  ): void => {
    const resolved = resolvePath(targetPath)
    const parent = path.posix.dirname(resolved)
    ensureDirChain(parent)
    const existing = nodes.get(resolved)
    const mode =
      writeOptions?.mode ??
      (existing?.kind === "file" ? existing.mode : DEFAULT_FILE_MODE)
    nodes.set(resolved, {
      kind: "file",
      content: Buffer.from(content),
      mtimeMs: Date.now(),
      mode,
    })
  }

  const mkdir = (targetPath: string, mkdirOptions?: { recursive?: boolean }): boolean => {
    const resolved = resolvePath(targetPath)
    if (nodes.has(resolved)) {
      return nodes.get(resolved)?.kind === "dir"
    }
    if (mkdirOptions?.recursive) {
      ensureDirChain(resolved)
      return true
    }
    const parent = path.posix.dirname(resolved)
    const parentNode = nodes.get(parent)
    if (!parentNode || parentNode.kind !== "dir") {
      return false
    }
    nodes.set(resolved, { kind: "dir", mtimeMs: Date.now(), mode: DEFAULT_DIR_MODE })
    return true
  }

  const readdir = (targetPath: string): ReadonlyArray<VfsEntry> => {
    const resolved = resolvePath(targetPath)
    const dirNode = nodes.get(resolved)
    if (!dirNode || dirNode.kind !== "dir") {
      return []
    }
    const prefix = resolved === "/" ? "/" : `${resolved}/`
    const entries: Array<VfsEntry> = []
    for (const [nodePath, node] of nodes.entries()) {
      if (!nodePath.startsWith(prefix) || nodePath === resolved) {
        continue
      }
      const rest = nodePath.slice(prefix.length)
      if (rest.includes("/")) {
        continue
      }
      entries.push({
        name: rest,
        path: nodePath,
        stat: toStat(node),
      })
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name))
  }

  const remove = (targetPath: string): boolean => {
    const resolved = resolvePath(targetPath)
    if (resolved === "/") {
      return false
    }
    const node = nodes.get(resolved)
    if (!node) {
      return false
    }
    if (node.kind === "dir") {
      const prefix = `${resolved}/`
      for (const key of Array.from(nodes.keys())) {
        if (key.startsWith(prefix)) {
          nodes.delete(key)
        }
      }
    }
    return nodes.delete(resolved)
  }

  const rename = (oldPath: string, newPath: string): boolean => {
    const from = resolvePath(oldPath)
    const to = resolvePath(newPath)
    const node = nodes.get(from)
    if (!node) {
      return false
    }
    const parent = path.posix.dirname(to)
    ensureDirChain(parent)
    if (node.kind === "dir") {
      const fromPrefix = `${from}/`
      const moves = Array.from(nodes.entries()).filter(([k]) => k.startsWith(fromPrefix))
      for (const [k, v] of moves) {
        nodes.delete(k)
        nodes.set(`${to}/${k.slice(fromPrefix.length)}`, v)
      }
    }
    nodes.delete(from)
    nodes.set(to, node)
    return true
  }

  return {
    home,
    resolvePath,
    stat,
    readFile,
    writeFile,
    mkdir,
    readdir,
    remove,
    rename,
  }
}

export const FILE_MODE_EXECUTABLE = DEFAULT_EXEC_MODE
