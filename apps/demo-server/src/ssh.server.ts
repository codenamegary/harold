import { Server } from "ssh2"
import { createAcpAgentRunner, createAgentSessionStore } from "./acp.agent"
import { routeExecCommand } from "./exec.router"
import { createVirtualGit } from "./git.virtual"
import { DEMO_HOME, seedVfsAndRepos } from "./seed.data"
import { attachSftpHandlers } from "./sftp.handlers"
import { createVfsStore } from "./vfs.store"

export type DemoSshServerOptions = {
  host: string
  port: number
  hostKey: string | Buffer
  timing?: {
    charDelayMs: number
    toolDelayMs: number
  }
}

export type DemoSshServerHandle = {
  listen: () => Promise<number>
  close: () => Promise<void>
}

export const createDemoSshServer = (options: DemoSshServerOptions): DemoSshServerHandle => {
  const server = new Server({ hostKeys: [options.hostKey] }, (client) => {
    const vfs = createVfsStore({ home: DEMO_HOME })
    const repos = seedVfsAndRepos(vfs)
    const git = createVirtualGit(vfs, repos)
    const sessionStore = createAgentSessionStore()

    client.on("authentication", (ctx) => {
      ctx.accept()
    })

    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept()

        session.on("sftp", (acceptSftp) => {
          const sftp = acceptSftp()
          attachSftpHandlers(sftp, vfs)
        })

        session.on("exec", (acceptExec, _rejectExec, info) => {
          const stream = acceptExec()
          const outcome = routeExecCommand(info.command, { vfs, git })

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

          const agent = createAcpAgentRunner({
            agentId: outcome.agentId,
            vfs,
            git,
            sessionStore,
            timing: options.timing,
            emit: (msg) => {
              if (!stream.destroyed) {
                stream.write(`${JSON.stringify(msg)}\n`)
              }
            },
          })

          const lineState = { buffer: "", queue: Promise.resolve() }
          stream.on("data", (chunk: Buffer) => {
            lineState.buffer += chunk.toString("utf8")
            const lines = lineState.buffer.split("\n")
            lineState.buffer = lines.pop() ?? ""
            for (const line of lines) {
              lineState.queue = lineState.queue.then(() => agent.handleLine(line))
            }
          })

          stream.on("end", () => {
            if (lineState.buffer.trim()) {
              lineState.queue = lineState.queue.then(() => agent.handleLine(lineState.buffer))
            }
            lineState.queue.finally(() => {
              stream.exit(0)
              stream.end()
            })
          })
        })
      })
    })

    client.on("error", () => {
      // Client disconnected abruptly; ignore so server stays up for other testers.
    })
  })

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
