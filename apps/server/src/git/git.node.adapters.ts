import { GitCommandResult, RunGit } from "core/git/ports"
import { spawn } from "node:child_process"

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_STDOUT_BYTES = 4 * 1024 * 1024
const MAX_STDERR_LENGTH = 2_000

export type RunGitOptions = Readonly<{
  defaultTimeoutMs?: number
  defaultMaxStdoutBytes?: number
}>

/**
 * Read-only git executor. Arguments are always an argv array and the caller
 * owns the fixed command shape. Nothing here fetches, writes, or prompts.
 */
export const makeRunGit =
  (options: RunGitOptions = {}): RunGit =>
  async (input): Promise<GitCommandResult> => {
    const timeoutMs = input.timeoutMs ?? options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxStdoutBytes =
      input.maxStdoutBytes ?? options.defaultMaxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES
    const allowExitCodes = new Set(input.allowExitCodes ?? [0])

    return await new Promise((resolve) => {
      let settled = false
      const finish = (result: GitCommandResult) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(result)
      }

      const child = spawn("git", ["-C", input.cwd, ...input.args], {
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          LC_ALL: "C",
          GIT_PAGER: "cat",
        },
        stdio: ["ignore", "pipe", "pipe"],
      })

      const stdoutChunks: Buffer[] = []
      let stdoutBytes = 0
      let stdoutTruncated = false
      let stderr = ""
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        child.kill("SIGKILL")
      }, timeoutMs)

      child.stdout.on("data", (chunk: Buffer) => {
        if (stdoutTruncated) {
          return
        }
        const remaining = maxStdoutBytes - stdoutBytes
        if (chunk.length > remaining) {
          if (remaining > 0) {
            stdoutChunks.push(chunk.subarray(0, remaining))
            stdoutBytes += remaining
          }
          stdoutTruncated = true
          child.kill("SIGKILL")
          return
        }
        stdoutChunks.push(chunk)
        stdoutBytes += chunk.length
      })

      child.stderr.setEncoding("utf8")
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-MAX_STDERR_LENGTH)
      })

      child.on("error", (error) => {
        const code = (error as NodeJS.ErrnoException).code
        finish({
          ok: false,
          error: {
            kind: code === "ENOENT" ? "unavailable" : "failed",
            detail: error.message,
          },
        })
      })

      child.on("close", (code, signal) => {
        const stdout = Buffer.concat(stdoutChunks).toString("utf8")
        if (timedOut) {
          finish({
            ok: false,
            error: {
              kind: "timeout",
              detail: `git ${input.args[0] ?? "command"} timed out after ${timeoutMs}ms`,
            },
          })
          return
        }
        if (stdoutTruncated) {
          finish({
            ok: true,
            value: { exitCode: 0, stdout, stderr, stdoutTruncated: true },
          })
          return
        }
        const exitCode = code ?? -1
        if (allowExitCodes.has(exitCode)) {
          finish({
            ok: true,
            value: { exitCode, stdout, stderr, stdoutTruncated: false },
          })
          return
        }
        const detail =
          stderr.trim() ||
          (signal === null
            ? `git ${input.args[0] ?? "command"} exited with code ${exitCode}`
            : `git ${input.args[0] ?? "command"} stopped by ${signal}`)
        finish({ ok: false, error: { kind: "failed", detail } })
      })
    })
  }
