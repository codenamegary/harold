import path from "node:path"
import { VirtualGit } from "./git.virtual"
import { AGENT_BINARIES } from "./seed.data"
import { VfsStore } from "./vfs.store"

export type ExecOutcome =
  | {
      kind: "result"
      exitCode: number
      stdout: string
      stderr: string
    }
  | {
      kind: "acp"
      agentId: string
    }

export type ExecRouterDeps = {
  vfs: VfsStore
  git: VirtualGit
}

const tokenizeShell = (input: string): Array<string> => {
  const tokens: Array<string> = []
  const chars = Array.from(input)
  const state = {
    idx: 0,
    current: "",
    hasToken: false,
    quote: "" as "" | "'" | '"',
  }

  while (state.idx < chars.length) {
    const ch = chars[state.idx] ?? ""
    if (state.quote === "'") {
      if (ch === "'") {
        state.quote = ""
      } else {
        state.current += ch
        state.hasToken = true
      }
      state.idx += 1
      continue
    }
    if (state.quote === '"') {
      if (ch === '"') {
        state.quote = ""
      } else if (ch === "\\" && state.idx + 1 < chars.length) {
        state.idx += 1
        state.current += chars[state.idx] ?? ""
        state.hasToken = true
      } else {
        state.current += ch
        state.hasToken = true
      }
      state.idx += 1
      continue
    }
    if (ch === "'" || ch === '"') {
      state.quote = ch
      state.hasToken = true
      state.idx += 1
      continue
    }
    if (ch === "\\" && state.idx + 1 < chars.length) {
      state.idx += 1
      state.current += chars[state.idx] ?? ""
      state.hasToken = true
      state.idx += 1
      continue
    }
    if (/\s/.test(ch)) {
      if (state.hasToken) {
        tokens.push(state.current)
        state.current = ""
        state.hasToken = false
      }
      state.idx += 1
      continue
    }
    state.current += ch
    state.hasToken = true
    state.idx += 1
  }

  if (state.hasToken) {
    tokens.push(state.current)
  }
  return tokens
}

const unwrapBashLc = (raw: string): string => {
  const trimmed = raw.trim()
  const tokens = tokenizeShell(trimmed)
  if (tokens[0] === "exec" && tokens[1] === "bash" && tokens[2] === "-lc" && tokens[3]) {
    return tokens[3]
  }
  if (tokens[0] === "bash" && tokens[1] === "-lc" && tokens[2]) {
    return tokens[2]
  }
  return trimmed
}

const resolveAgentIdFromToken = (token: string): string | null => {
  const base = path.posix.basename(token)
  for (const [agentId, binPath] of Object.entries(AGENT_BINARIES)) {
    if (token === binPath || base === path.posix.basename(binPath) || token === agentId) {
      return agentId
    }
  }
  return null
}

export const routeExecCommand = (rawCommand: string, deps: ExecRouterDeps): ExecOutcome => {
  const command = unwrapBashLc(rawCommand)

  // KnownAgents presence probe script
  if (command.includes("command -v") && command.includes("for pair in")) {
    const lines = Object.entries(AGENT_BINARIES).map(([id, binPath]) => `${id}\t${binPath}`)
    return { kind: "result", exitCode: 0, stdout: `${lines.join("\n")}\n`, stderr: "" }
  }

  // KnownAgents stale-path probe script
  if (command.includes('[ -x "$p" ]') && command.includes("for p in")) {
    const match = command.match(/^for p in (.*?); do/)
    const rawPaths = match?.[1] ? tokenizeShell(match[1]) : []
    const stale = rawPaths.filter((p) => !deps.vfs.stat(p)?.isExecutable)
    return {
      kind: "result",
      exitCode: 0,
      stdout: stale.length > 0 ? `${stale.join("\n")}\n` : "",
      stderr: "",
    }
  }

  // Auth status probes
  if (command.includes("auth status")) {
    return {
      kind: "result",
      exitCode: 0,
      stdout: '{"loggedIn":true,"status":"authenticated"}\n',
      stderr: "",
    }
  }
  if (command.includes("auth list")) {
    return { kind: "result", exitCode: 0, stdout: "Logged in\n", stderr: "" }
  }
  if (command.includes("status --format")) {
    return {
      kind: "result",
      exitCode: 0,
      stdout: '{"isAuthenticated":true,"status":"authenticated"}\n',
      stderr: "",
    }
  }

  // `cd <dir> && git ...`
  if (command.includes("&&")) {
    const [firstPart, secondPart] = command.split("&&", 2).map((s) => s.trim())
    if (firstPart && secondPart) {
      const firstTokens = tokenizeShell(firstPart)
      const secondTokens = tokenizeShell(secondPart)
      if (firstTokens[0] === "cd" && firstTokens[1] && secondTokens[0] === "git") {
        const res = deps.git.run(firstTokens[1], secondTokens.slice(1))
        return { kind: "result", ...res }
      }
    }
  }

  // `export PATH=...; exec ...`
  const afterSemicolon = command.includes(";")
    ? (command.split(";").pop() ?? command).trim()
    : command
  const tokens = tokenizeShell(afterSemicolon)
  if (tokens.length === 0) {
    return { kind: "result", exitCode: 0, stdout: "", stderr: "" }
  }

  // `exec <agent> ...` or direct `<agent> ...`
  const execTokens = tokens[0] === "exec" ? tokens.slice(1) : tokens
  const firstExec = execTokens[0]
  if (firstExec) {
    const agentId = resolveAgentIdFromToken(firstExec)
    if (agentId) {
      return { kind: "acp", agentId }
    }
  }

  if (tokens[0] === "test" && tokens[1] === "-x" && tokens[2]) {
    const ok = deps.vfs.stat(tokens[2])?.isExecutable ?? false
    return { kind: "result", exitCode: ok ? 0 : 1, stdout: "", stderr: "" }
  }

  if (tokens[0] === "git") {
    const res = deps.git.run(deps.vfs.home, tokens.slice(1))
    return { kind: "result", ...res }
  }

  if (tokens[0] === "rm") {
    const target = tokens.filter((t) => !t.startsWith("-")).slice(1)[0]
    if (target) {
      deps.vfs.remove(target)
    }
    return { kind: "result", exitCode: 0, stdout: "", stderr: "" }
  }

  if (tokens[0] === "mkdir") {
    const target = tokens.filter((t) => !t.startsWith("-")).slice(1)[0]
    if (target) {
      deps.vfs.mkdir(target, { recursive: true })
    }
    return { kind: "result", exitCode: 0, stdout: "", stderr: "" }
  }

  if (tokens[0] === "pwd") {
    return { kind: "result", exitCode: 0, stdout: `${deps.vfs.home}\n`, stderr: "" }
  }

  if (tokens[0] === "echo") {
    return {
      kind: "result",
      exitCode: 0,
      stdout: `${tokens.slice(1).join(" ")}\n`,
      stderr: "",
    }
  }

  if (tokens[0] === "uname") {
    return { kind: "result", exitCode: 0, stdout: "Linux\n", stderr: "" }
  }

  return {
    kind: "result",
    exitCode: 127,
    stdout: "",
    stderr: `sh: ${tokens[0]}: command not found\n`,
  }
}
