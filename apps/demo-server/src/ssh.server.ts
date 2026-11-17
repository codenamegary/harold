import { Server } from "ssh2"
import { createAcpAgentRunner, createAgentSessionStore, createInitializeResult } from "./acp.agent"
import { isHostScriptCommand, routeExecCommand } from "./exec.router"
import { createVirtualGit } from "./git.virtual"
import { createDemoHostStore } from "./host.store"
import { DEMO_HOME, seedVfsAndRepos } from "./seed.data"
import { DEFAULT_MAX_SFTP_HANDLES, attachSftpHandlers } from "./sftp.handlers"
import { createVfsStore } from "./vfs.store"

export type DemoSshLimits = {
  maxConnections: number
  maxSessionsPerConnection: number
  maxSftpHandles: number
  maxExecLineBytes: number
  maxExecPendingLines: number
  maxCommandBytes: number
  /** The app inlines the host script in every host command. */
  maxHostCommandBytes: number
}

export const DEFAULT_DEMO_SSH_LIMITS: DemoSshLimits = {
  maxConnections: 16,
  maxSessionsPerConnection: 16,
  maxSftpHandles: DEFAULT_MAX_SFTP_HANDLES,
  maxExecLineBytes: 256 * 1024,
  maxExecPendingLines: 64,
  maxCommandBytes: 16 * 1024,
  /** The app inlines the host script (~16 KB) in every host command. */
  maxHostCommandBytes: 32 * 1024,
}

export type DemoSshServerOptions = {
  host: string
  port: number
  hostKey: string | Buffer
  seedWarningRun?: boolean
  timing?: {
    charDelayMs: number
    toolDelayMs: number
  }
  limits?: Partial<DemoSshLimits>
}

export type DemoSshServerHandle = {
  listen: () => Promise<number>
  close: () => Promise<void>
}

type ExecLineState = {
  buffer: string
  pendingLines: number
  queue: Promise<void>
  closed: boolean
}

const byteLength = (value: string): number => Buffer.byteLength(value, "utf8")

export const createDemoSshServer = (options: DemoSshServerOptions): DemoSshServerHandle => {
  const limits = { ...DEFAULT_DEMO_SSH_LIMITS, ...options.limits }
  // Sessions are server state, not connection state. The app can create a
  // session on one pooled SSH connection and list or load it on another.
  const sessionStore = createAgentSessionStore()
  // Host runs are also server state: a reconnect must reuse the active run.
  const host = createDemoHostStore({ seedWarningRun: options.seedWarningRun })

  const server = new Server(
    {
      hostKeys: [options.hostKey],
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3,
    },
    (client) => {
      const vfs = createVfsStore({ home: DEMO_HOME })
      const repos = seedVfsAndRepos(vfs)
      const git = createVirtualGit(vfs, repos)

      client.on("authentication", (ctx) => {
        ctx.accept()
      })

      client.on("ready", () => {
        const sessions = { active: 0 }

        const releaseSession = (): void => {
          if (sessions.active > 0) {
            sessions.active -= 1
          }
        }

        client.once("close", () => {
          sessions.active = 0
        })

        client.on("session", (accept, reject) => {
          if (sessions.active >= limits.maxSessionsPerConnection) {
            reject()
            return
          }
          sessions.active += 1

          const session = accept()
          const release = (() => {
            const state = { released: false }
            return (): void => {
              if (state.released) {
                return
              }
              state.released = true
              releaseSession()
            }
          })()

          session.on("sftp", (acceptSftp) => {
            const sftp = acceptSftp()
            sftp.once("close", release)
            attachSftpHandlers(sftp, vfs, { maxHandles: limits.maxSftpHandles })
          })

          session.on("exec", (acceptExec, _rejectExec, info) => {
            const stream = acceptExec()
            stream.once("close", release)

            const commandLimit = isHostScriptCommand(info.command)
              ? limits.maxHostCommandBytes
              : limits.maxCommandBytes
            if (byteLength(info.command) > commandLimit) {
              stream.stderr.write(`exec command exceeds ${commandLimit} bytes\n`)
              stream.exit(1)
              stream.end()
              return
            }

            const outcome = routeExecCommand(info.command, { vfs, git, host })

            if (outcome.kind === "result") {
              if (outcome.stdout) {
                stream.write(outcome.stdout)
              }
              if (outcome.stderr) {
                stream.stderr.write(outcome.stderr)
              }
              stream.exit(outcome.exitCode)
              stream.end()
              return
            }

            const hostConnect = outcome.kind === "host-connect"
            if (hostConnect) {
              const initLine = `${JSON.stringify({
                jsonrpc: "2.0",
                id: "harold-host-init",
                result: createInitializeResult(outcome.agentId),
              })}\n`
              if (!stream.destroyed) {
                stream.write(initLine)
              }
              if (outcome.run.created) {
                host.recordOut(outcome.agentId, byteLength(initLine))
              }
            }

            const agent = createAcpAgentRunner({
              agentId: outcome.agentId,
              vfs,
              git,
              sessionStore,
              timing: options.timing,
              hostInitialized: hostConnect,
              emit: (msg) => {
                const line = `${JSON.stringify(msg)}\n`
                if (!stream.destroyed) {
                  stream.write(line)
                }
                if (hostConnect) {
                  host.recordOut(outcome.agentId, byteLength(line))
                }
              },
            })

            const lineState: ExecLineState = {
              buffer: "",
              pendingLines: 0,
              queue: Promise.resolve(),
              closed: false,
            }

            const fail = (message: string): void => {
              if (lineState.closed) {
                return
              }
              lineState.closed = true
              if (!stream.destroyed) {
                stream.stderr.write(`${message}\n`)
              }
              stream.exit(1)
              stream.end()
            }

            const enqueue = (line: string): void => {
              if (lineState.pendingLines >= limits.maxExecPendingLines) {
                fail(`exec input queue exceeds ${limits.maxExecPendingLines} lines`)
                return
              }
              lineState.pendingLines += 1
              lineState.queue = lineState.queue
                .then(() => agent.handleLine(line))
                .finally(() => {
                  lineState.pendingLines -= 1
                })
            }

            stream.on("data", (chunk: Buffer) => {
              if (lineState.closed) {
                return
              }
              const text = chunk.toString("utf8")
              if (byteLength(lineState.buffer) + byteLength(text) > limits.maxExecLineBytes) {
                fail(`exec input line exceeds ${limits.maxExecLineBytes} bytes`)
                return
              }
              lineState.buffer += text
              const lines = lineState.buffer.split("\n")
              lineState.buffer = lines.pop() ?? ""
              for (const line of lines) {
                enqueue(line)
                if (lineState.closed) {
                  return
                }
              }
            })

            stream.on("end", () => {
              if (lineState.closed) {
                return
              }
              if (lineState.buffer.trim()) {
                enqueue(lineState.buffer)
              }
              lineState.queue
                .then(() => {
                  if (lineState.closed) {
                    return
                  }
                  stream.exit(0)
                  stream.end()
                })
                .catch((error: unknown) => {
                  const reason = error instanceof Error ? error.message : "unknown error"
                  if (!stream.destroyed) {
                    stream.stderr.write(`agent session failed: ${reason}\n`)
                  }
                  stream.exit(1)
                  stream.end()
                })
            })
          })
        })
      })

      client.on("error", () => {
        // Client disconnected abruptly; ignore so server stays up for other testers.
      })
    },
  )

  server.maxConnections = limits.maxConnections

  const listen = (): Promise<number> =>
    new Promise((resolve, reject) => {
      server.once("error", reject)
      server.listen(options.port, options.host, () => {
        server.off("error", reject)
        const address = server.address()
        const boundPort = typeof address === "object" && address ? address.port : options.port
        resolve(boundPort)
      })
    })

  const close = (): Promise<void> =>
    new Promise((resolve) => {
      server.close(() => resolve())
    })

  return { listen, close }
}
