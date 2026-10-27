import { spawn } from "node:child_process"
import { CloneRepository } from "core/workspace/ports"

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_DETAIL_LENGTH = 2000

export type CloneRepositoryOptions = Readonly<{
  timeoutMs?: number
}>

/**
 * Clones with the host's own git setup: system credentials, SSH agent,
 * credential helpers, and gh configuration. Harold stores no secrets and
 * never shells out, so a hostile url cannot inject options.
 */
export const makeCloneRepository =
  (options: CloneRepositoryOptions = {}): CloneRepository =>
  async ({ url, destinationPath }) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

    return await new Promise((resolve) => {
      const env = {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        // Keep a host-provided SSH command (keys, jump hosts) but never let
        // ssh prompt on the daemon's stdin.
        GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes",
      }

      const child = spawn("git", ["clone", "--", url, destinationPath], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      })

      let stderr = ""
      child.stderr.setEncoding("utf8")
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-MAX_DETAIL_LENGTH)
      })

      const timer = setTimeout(() => {
        child.kill("SIGKILL")
      }, timeoutMs)

      const fail = (detail: string) => {
        resolve({ ok: false, error: { kind: "clone_failed", detail } })
      }

      child.on("error", (error) => {
        clearTimeout(timer)
        fail(error.message)
      })

      child.on("close", (code, signal) => {
        clearTimeout(timer)

        if (code === 0) {
          resolve({ ok: true })
          return
        }

        const detail =
          stderr.trim() ||
          (signal === null
            ? `git clone exited with code ${code}`
            : `git clone stopped by ${signal}`)
        fail(detail)
      })
    })
  }
