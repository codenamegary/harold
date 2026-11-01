import {
  GitChangedFile,
  GitDiffHunk,
  GitDiffLine,
  GitDiffLineKind,
  GitFileStatus,
} from "contracts/http/git"
import path from "node:path"

export type ParsedWorktree = Readonly<{
  path: string
  headSha: string
  branch: string | null
  prunable: boolean
  bare: boolean
}>

export type ParsedStatusEntry = Readonly<{
  path: string
  oldPath: string | null
  status: GitFileStatus
  submodule: boolean
}>

export type ParsedNumstat = Readonly<{
  path: string
  oldPath: string | null
  additions: number | null
  deletions: number | null
  binary: boolean
}>

export type ParsedNameStatus = Readonly<{
  path: string
  oldPath: string | null
  status: GitFileStatus
}>

export type ParsedDiff = Readonly<{
  hunks: ReadonlyArray<GitDiffHunk>
  truncated: boolean
}>

export const ZERO_SHA = "0000000000000000000000000000000000000000"

export const stripRef = (ref: string): string =>
  ref.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\/[^/]+\//, "")

export const isSafeRepoRelativePath = (value: string): boolean => {
  if (value.length === 0 || value.includes("\0") || path.isAbsolute(value)) {
    return false
  }
  return value.split("/").every((segment) => segment !== "..")
}

export const isSafeRepoRelativePathOrNull = (value: string | null): boolean =>
  value === null || isSafeRepoRelativePath(value)

export const statusFromStatusV2 = (xy: string): GitFileStatus => {
  if (xy.includes("U")) return "conflicted"
  if (xy.includes("R")) return "renamed"
  if (xy.includes("C")) return "copied"
  if (xy.includes("A")) return "added"
  if (xy.includes("D")) return "deleted"
  if (xy.includes("T")) return "type_changed"
  return "modified"
}

export const statusFromNameCode = (code: string): GitFileStatus => {
  switch (code[0]) {
    case "A":
      return "added"
    case "D":
      return "deleted"
    case "R":
      return "renamed"
    case "C":
      return "copied"
    case "T":
      return "type_changed"
    case "U":
      return "conflicted"
    default:
      return "modified"
  }
}

export const parseWorktreeList = (stdout: string): ParsedWorktree[] => {
  const tokens = stdout.split("\0")
  const entries: ParsedWorktree[] = []
  let current: {
    path?: string
    headSha?: string
    branch: string | null
    prunable: boolean
    bare: boolean
  } = { branch: null, prunable: false, bare: false }

  const flush = () => {
    if (current.path !== undefined && current.headSha !== undefined) {
      entries.push({
        path: current.path,
        headSha: current.headSha,
        branch: current.branch,
        prunable: current.prunable,
        bare: current.bare,
      })
    }
    current = { branch: null, prunable: false, bare: false }
  }

  for (const token of tokens) {
    if (token.length === 0) {
      flush()
      continue
    }
    if (token.startsWith("worktree ")) {
      if (current.path !== undefined) {
        flush()
      }
      current.path = token.slice("worktree ".length)
    } else if (token.startsWith("HEAD ")) {
      current.headSha = token.slice("HEAD ".length)
    } else if (token.startsWith("branch ")) {
      current.branch = stripRef(token.slice("branch ".length))
    } else if (token === "detached") {
      current.branch = null
    } else if (token === "bare") {
      current.bare = true
    } else if (token.startsWith("prunable")) {
      current.prunable = true
    }
  }
  flush()
  return entries
}

export const parseStatusEntries = (stdout: string): ParsedStatusEntry[] => {
  const tokens = stdout.split("\0")
  const entries: ParsedStatusEntry[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined || token.length === 0) {
      continue
    }
    if (token.startsWith("! ")) {
      continue
    }
    if (token.startsWith("? ")) {
      entries.push({
        path: token.slice(2),
        oldPath: null,
        status: "untracked",
        submodule: false,
      })
      continue
    }
    if (token.startsWith("1 ")) {
      const parts = token.split(" ", 9)
      entries.push({
        path: parts[8] ?? "",
        oldPath: null,
        status: statusFromStatusV2(parts[1] ?? ""),
        submodule: (parts[2] ?? "").includes("S"),
      })
      continue
    }
    if (token.startsWith("2 ")) {
      const parts = token.split(" ", 10)
      const oldPath = tokens[index + 1] ?? null
      index += 1
      entries.push({
        path: parts[9] ?? "",
        oldPath,
        status: statusFromStatusV2(parts[1] ?? ""),
        submodule: (parts[2] ?? "").includes("S"),
      })
      continue
    }
    if (token.startsWith("u ")) {
      const parts = token.split(" ", 11)
      entries.push({
        path: parts[10] ?? "",
        oldPath: null,
        status: "conflicted",
        submodule: (parts[2] ?? "").includes("S"),
      })
    }
  }

  return entries.filter((entry) => entry.path.length > 0)
}

export const parseNumstat = (stdout: string): ParsedNumstat[] => {
  const tokens = stdout.split("\0")
  const entries: ParsedNumstat[] = []

  for (let index = 0; index < tokens.length;) {
    const token = tokens[index]
    if (token === undefined || token.length === 0) {
      index += 1
      continue
    }
    const parts = token.split("\t")
    if (parts.length < 3) {
      index += 1
      continue
    }
    const additions = parts[0] === "-" ? null : Number(parts[0])
    const deletions = parts[1] === "-" ? null : Number(parts[1])
    let path = parts[2] ?? ""
    let oldPath: string | null = null

    if (path.length === 0) {
      oldPath = tokens[index + 1] ?? null
      path = tokens[index + 2] ?? ""
      index += 3
    } else {
      index += 1
    }

    if (path.length > 0) {
      entries.push({
        path,
        oldPath,
        additions: additions === null || Number.isNaN(additions) ? null : additions,
        deletions: deletions === null || Number.isNaN(deletions) ? null : deletions,
        binary: additions === null || deletions === null,
      })
    }
  }

  return entries
}

export const parseNameStatus = (stdout: string): ParsedNameStatus[] => {
  const tokens = stdout.split("\0")
  const entries: ParsedNameStatus[] = []

  for (let index = 0; index < tokens.length;) {
    const code = tokens[index]
    if (code === undefined || code.length === 0) {
      index += 1
      continue
    }
    if (code.startsWith("R") || code.startsWith("C")) {
      const oldPath = tokens[index + 1] ?? ""
      const path = tokens[index + 2] ?? ""
      if (path.length > 0) {
        entries.push({ path, oldPath: oldPath || null, status: statusFromNameCode(code) })
      }
      index += 3
      continue
    }
    const path = tokens[index + 1] ?? ""
    if (path.length > 0) {
      entries.push({ path, oldPath: null, status: statusFromNameCode(code) })
    }
    index += 2
  }

  return entries
}

export const parseUnifiedDiff = (
  stdout: string,
  maxLines = 2000,
  stdoutTruncated = false,
): ParsedDiff => {
  const hunks: GitDiffHunk[] = []
  const headerPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/
  let current: GitDiffHunk | null = null
  let currentOldLine = 0
  let currentNewLine = 0
  let lineCount = 0
  let truncated = stdoutTruncated

  const flush = () => {
    if (current !== null) {
      hunks.push(current)
      current = null
    }
  }

  for (const rawLine of stdout.split("\n")) {
    const match = headerPattern.exec(rawLine)
    if (match !== null) {
      flush()
      currentOldLine = Number(match[1])
      currentNewLine = Number(match[3])
      current = {
        header: rawLine,
        oldStart: currentOldLine,
        oldLines: match[2] === undefined ? 1 : Number(match[2]),
        newStart: currentNewLine,
        newLines: match[4] === undefined ? 1 : Number(match[4]),
        lines: [],
      }
      lineCount = 0
      continue
    }
    if (current === null || rawLine.length === 0) {
      continue
    }
    if (rawLine.startsWith("\\ No newline at end of file")) {
      continue
    }

    const prefix = rawLine[0]
    let kind: GitDiffLineKind
    let text: string
    if (prefix === "+") {
      kind = "addition"
      text = rawLine.slice(1)
    } else if (prefix === "-") {
      kind = "deletion"
      text = rawLine.slice(1)
    } else if (prefix === " ") {
      kind = "context"
      text = rawLine.slice(1)
    } else {
      continue
    }

    const oldLineNumber = kind === "addition" ? null : currentOldLine++
    const newLineNumber = kind === "deletion" ? null : currentNewLine++
    const line: GitDiffLine = {
      kind,
      oldLineNumber,
      newLineNumber,
      text,
    }
    current.lines.push(line)
    lineCount += 1
    if (lineCount >= maxLines) {
      truncated = true
      break
    }
  }
  flush()

  if (truncated && hunks.length > 0) {
    const last = hunks[hunks.length - 1]
    const actualOld = last.lines.filter((line) => line.kind !== "addition").length
    const actualNew = last.lines.filter((line) => line.kind !== "deletion").length
    if (actualOld !== last.oldLines || actualNew !== last.newLines) {
      hunks.pop()
    }
  }

  return { hunks, truncated }
}

export const totalsFor = (
  files: ReadonlyArray<Pick<GitChangedFile, "additions" | "deletions">>,
) => ({
  files: files.length,
  additions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
  deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
})

export const isSubmoduleLsTree = (stdout: string): boolean => {
  const token = stdout.split("\0")[0] ?? ""
  return token.startsWith("160000 ")
}
