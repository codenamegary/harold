import { VfsStore } from "./vfs.store"

export type VirtualRepoConfig = {
  root: string
  branch: string
  defaultBranch: string
  headSha: string
  mergeBaseSha: string
  worktreeGroup: string
  isMainWorktree: boolean
}

export type GitExecResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type RepoState = {
  config: VirtualRepoConfig
  baseFiles: ReadonlyMap<string, string>
  headFiles: Map<string, string>
  headSha: string
  commitCount: number
}

export type VirtualGit = {
  run: (cwd: string, args: ReadonlyArray<string>) => GitExecResult
  commitAll: (repoRoot: string, message: string) => void
  findRepoRoot: (cwd: string) => string | null
}

const collectFilesUnder = (vfs: VfsStore, root: string): Map<string, string> => {
  const result = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const entry of vfs.readdir(dir)) {
      if (entry.name === ".git") {
        continue
      }
      if (entry.stat.isDirectory) {
        walk(entry.path)
      } else {
        const buf = vfs.readFile(entry.path)
        const rel = entry.path.slice(root.length + 1)
        result.set(rel, buf ? buf.toString("utf8") : "")
      }
    }
  }
  walk(root)
  return result
}

const splitLines = (text: string): ReadonlyArray<string> => {
  if (text === "") {
    return []
  }
  const lines = text.split("\n")
  if (lines[lines.length - 1] === "") {
    return lines.slice(0, -1)
  }
  return lines
}

type DiffOp = { kind: "equal" | "del" | "add"; line: string }

const computeLineOps = (
  oldLines: ReadonlyArray<string>,
  newLines: ReadonlyArray<string>,
): ReadonlyArray<DiffOp> => {
  const m = oldLines.length
  const n = newLines.length
  const dp: Array<Array<number>> = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  )

  for (const i of Array.from({ length: m }, (_, idx) => m - 1 - idx)) {
    for (const j of Array.from({ length: n }, (_, idx) => n - 1 - idx)) {
      const row = dp[i]
      const nextRow = dp[i + 1]
      if (!row || !nextRow) {
        continue
      }
      if (oldLines[i] === newLines[j]) {
        row[j] = (nextRow[j + 1] ?? 0) + 1
      } else {
        row[j] = Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0)
      }
    }
  }

  const ops: Array<DiffOp> = []
  const step = (i: number, j: number): void => {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      ops.push({ kind: "equal", line: oldLines[i] ?? "" })
      step(i + 1, j + 1)
      return
    }
    if (j < n && (i === m || (dp[i]?.[j + 1] ?? 0) >= (dp[i + 1]?.[j] ?? 0))) {
      ops.push({ kind: "add", line: newLines[j] ?? "" })
      step(i, j + 1)
      return
    }
    if (i < m) {
      ops.push({ kind: "del", line: oldLines[i] ?? "" })
      step(i + 1, j)
    }
  }
  step(0, 0)
  return ops
}

const countChanges = (
  oldText: string,
  newText: string,
): { additions: number; deletions: number } => {
  const ops = computeLineOps(splitLines(oldText), splitLines(newText))
  return ops.reduce(
    (acc, op) => ({
      additions: acc.additions + (op.kind === "add" ? 1 : 0),
      deletions: acc.deletions + (op.kind === "del" ? 1 : 0),
    }),
    { additions: 0, deletions: 0 },
  )
}

const formatUnifiedDiff = (
  filePath: string,
  oldText: string | null,
  newText: string | null,
): string => {
  const oldLines = splitLines(oldText ?? "")
  const newLines = splitLines(newText ?? "")
  if (oldText === newText) {
    return ""
  }
  const ops = computeLineOps(oldLines, newLines)
  const oldCount = oldLines.length
  const newCount = newLines.length
  const oldStart = oldCount === 0 ? 0 : 1
  const newStart = newCount === 0 ? 0 : 1

  const body = ops.map((op) => {
    if (op.kind === "equal") return ` ${op.line}`
    if (op.kind === "del") return `-${op.line}`
    return `+${op.line}`
  })

  const aHeader = oldText === null ? "/dev/null" : `a/${filePath}`
  const bHeader = newText === null ? "/dev/null" : `b/${filePath}`
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- ${aHeader}`,
    `+++ ${bHeader}`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ...body,
    "",
  ].join("\n")
}

export const createVirtualGit = (
  vfs: VfsStore,
  configs: ReadonlyArray<VirtualRepoConfig>,
): VirtualGit => {
  const repos = new Map<string, RepoState>()
  for (const config of configs) {
    const initial = collectFilesUnder(vfs, config.root)
    repos.set(config.root, {
      config,
      baseFiles: new Map(initial),
      headFiles: new Map(initial),
      headSha: config.headSha,
      commitCount: 0,
    })
  }

  const findRepoRoot = (cwd: string): string | null => {
    const resolved = vfs.resolvePath(cwd)
    const roots = Array.from(repos.keys()).sort((a, b) => b.length - a.length)
    return (
      roots.find((root) => resolved === root || resolved.startsWith(`${root}/`)) ?? null
    )
  }

  const commitAll = (repoRoot: string, _message: string): void => {
    const state = repos.get(repoRoot)
    if (!state) {
      return
    }
    state.headFiles = collectFilesUnder(vfs, repoRoot)
    state.commitCount += 1
    const suffix = state.commitCount.toString(16).padStart(8, "0")
    state.headSha = `${state.config.headSha.slice(0, 32)}${suffix}`
  }

  const workingVsHead = (state: RepoState) => {
    const working = collectFilesUnder(vfs, state.config.root)
    const allPaths = Array.from(
      new Set([...state.headFiles.keys(), ...working.keys()]),
    ).sort()
    const entries: Array<{ path: string; code: string; oldText: string | null; newText: string | null }> = []
    for (const rel of allPaths) {
      const oldText = state.headFiles.get(rel) ?? null
      const newText = working.get(rel) ?? null
      if (oldText === null && newText !== null) {
        entries.push({ path: rel, code: "??", oldText: null, newText })
      } else if (oldText !== null && newText === null) {
        entries.push({ path: rel, code: " D", oldText, newText: null })
      } else if (oldText !== null && newText !== null && oldText !== newText) {
        entries.push({ path: rel, code: " M", oldText, newText })
      }
    }
    return entries
  }

  const headVsBase = (state: RepoState) => {
    const allPaths = Array.from(
      new Set([...state.baseFiles.keys(), ...state.headFiles.keys()]),
    ).sort()
    const entries: Array<{ path: string; status: string; oldText: string | null; newText: string | null }> = []
    for (const rel of allPaths) {
      const oldText = state.baseFiles.get(rel) ?? null
      const newText = state.headFiles.get(rel) ?? null
      if (oldText === null && newText !== null) {
        entries.push({ path: rel, status: "A", oldText: null, newText })
      } else if (oldText !== null && newText === null) {
        entries.push({ path: rel, status: "D", oldText, newText: null })
      } else if (oldText !== null && newText !== null && oldText !== newText) {
        entries.push({ path: rel, status: "M", oldText, newText })
      }
    }
    return entries
  }

  const run = (cwd: string, args: ReadonlyArray<string>): GitExecResult => {
    const root = findRepoRoot(cwd)
    if (!root) {
      return {
        exitCode: 128,
        stdout: "",
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
      }
    }
    const state = repos.get(root)
    if (!state) {
      return { exitCode: 128, stdout: "", stderr: "fatal: not a git repository\n" }
    }

    const [sub, ...rest] = args
    if (sub === "rev-parse") {
      const target = rest[0]
      if (target === "--is-inside-work-tree") {
        return { exitCode: 0, stdout: "true\n", stderr: "" }
      }
      if (target === "--show-toplevel") {
        return { exitCode: 0, stdout: `${root}\n`, stderr: "" }
      }
      if (target === "--abbrev-ref" && rest[1] === "HEAD") {
        return { exitCode: 0, stdout: `${state.config.branch}\n`, stderr: "" }
      }
      if (target === "HEAD") {
        return { exitCode: 0, stdout: `${state.headSha}\n`, stderr: "" }
      }
      return { exitCode: 0, stdout: `${state.headSha}\n`, stderr: "" }
    }

    if (sub === "symbolic-ref") {
      return {
        exitCode: 0,
        stdout: `origin/${state.config.defaultBranch}\n`,
        stderr: "",
      }
    }

    if (sub === "branch") {
      const branches = Array.from(
        new Set([state.config.defaultBranch, state.config.branch]),
      )
      return { exitCode: 0, stdout: `${branches.join("\n")}\n`, stderr: "" }
    }

    if (sub === "merge-base") {
      return { exitCode: 0, stdout: `${state.config.mergeBaseSha}\n`, stderr: "" }
    }

    if (sub === "worktree" && rest[0] === "list") {
      const groupRepos = Array.from(repos.values())
        .filter((r) => r.config.worktreeGroup === state.config.worktreeGroup)
        .sort((a, b) => Number(b.config.isMainWorktree) - Number(a.config.isMainWorktree))
      const blocks = groupRepos.map((r) =>
        [
          `worktree ${r.config.root}`,
          `HEAD ${r.headSha}`,
          `branch refs/heads/${r.config.branch}`,
        ].join("\n"),
      )
      return { exitCode: 0, stdout: `${blocks.join("\n\n")}\n\n`, stderr: "" }
    }

    if (sub === "status") {
      const entries = workingVsHead(state)
      const lines = entries.map((e) => `${e.code} ${e.path}`)
      return {
        exitCode: 0,
        stdout: lines.length > 0 ? `${lines.join("\n")}\n` : "",
        stderr: "",
      }
    }

    if (sub === "diff") {
      const isCached = rest.includes("--cached")
      if (isCached) {
        return { exitCode: 0, stdout: "", stderr: "" }
      }
      const isNoIndex = rest.includes("--no-index")
      const isNumstat = rest.includes("--numstat")
      const isNameOnly = rest.includes("--name-only")
      const isNameStatus = rest.includes("--name-status")
      const dashDashIdx = rest.indexOf("--")
      const pathArgs = dashDashIdx >= 0 ? rest.slice(dashDashIdx + 1) : []
      const hasHeadRef = rest.includes("HEAD")

      if (isNoIndex) {
        const filePath = pathArgs[pathArgs.length - 1] ?? ""
        const buf = vfs.readFile(`${root}/${filePath}`)
        if (!buf) {
          return { exitCode: 0, stdout: "", stderr: "" }
        }
        return {
          exitCode: 0,
          stdout: formatUnifiedDiff(filePath, null, buf.toString("utf8")),
          stderr: "",
        }
      }

      if (isNumstat && !hasHeadRef) {
        const entries = workingVsHead(state).filter((e) => e.code !== "??")
        const lines = entries.map((e) => {
          const counts = countChanges(e.oldText ?? "", e.newText ?? "")
          return `${counts.additions}\t${counts.deletions}\t${e.path}`
        })
        return {
          exitCode: 0,
          stdout: lines.length > 0 ? `${lines.join("\n")}\n` : "",
          stderr: "",
        }
      }

      if (hasHeadRef && (isNameOnly || isNameStatus || isNumstat) && pathArgs.length === 0) {
        const entries = headVsBase(state)
        if (isNameOnly) {
          return {
            exitCode: 0,
            stdout: entries.length > 0 ? `${entries.map((e) => e.path).join("\n")}\n` : "",
            stderr: "",
          }
        }
        if (isNameStatus) {
          return {
            exitCode: 0,
            stdout:
              entries.length > 0
                ? `${entries.map((e) => `${e.status}\t${e.path}`).join("\n")}\n`
                : "",
            stderr: "",
          }
        }
        if (isNumstat) {
          const lines = entries.map((e) => {
            const counts = countChanges(e.oldText ?? "", e.newText ?? "")
            return `${counts.additions}\t${counts.deletions}\t${e.path}`
          })
          return {
            exitCode: 0,
            stdout: lines.length > 0 ? `${lines.join("\n")}\n` : "",
            stderr: "",
          }
        }
      }

      if (pathArgs.length > 0) {
        const filePath = pathArgs[pathArgs.length - 1] ?? ""
        const baseRef = rest.find((r) => !r.startsWith("-") && r !== "--" && !pathArgs.includes(r))
        if (baseRef === "HEAD") {
          const entry = workingVsHead(state).find((e) => e.path === filePath)
          if (!entry || entry.code === "??") {
            return { exitCode: 0, stdout: "", stderr: "" }
          }
          return {
            exitCode: 0,
            stdout: formatUnifiedDiff(filePath, entry.oldText, entry.newText),
            stderr: "",
          }
        }
        const working = collectFilesUnder(vfs, root)
        const oldText = state.baseFiles.get(filePath) ?? null
        const newText = working.get(filePath) ?? state.headFiles.get(filePath) ?? null
        if (oldText === newText) {
          return { exitCode: 0, stdout: "", stderr: "" }
        }
        return {
          exitCode: 0,
          stdout: formatUnifiedDiff(filePath, oldText, newText),
          stderr: "",
        }
      }

      return { exitCode: 0, stdout: "", stderr: "" }
    }

    return { exitCode: 0, stdout: "", stderr: "" }
  }

  return {
    run,
    commitAll,
    findRepoRoot,
  }
}
