import { ChildProcess, spawn } from "node:child_process"
import { createInterface, Interface } from "node:readline"

type JsonRpcResponse = {
  id?: number
  result?: unknown
  error?: { message?: string }
}

const sendRequest = (
  proc: ChildProcess,
  reader: Interface,
  method: string,
  params: unknown,
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1_000_000)

    const onLine = (line: string) => {
      try {
        const message = JSON.parse(line) as JsonRpcResponse
        if (message.id !== id) {
          return
        }

        reader.off("line", onLine)
        if (message.error !== undefined) {
          reject(new Error(message.error.message ?? "ACP request failed"))
          return
        }

        resolve(message.result)
      } catch {
        // Ignore non-JSON lines from the agent process.
      }
    }

    reader.on("line", onLine)
    proc.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
  })

const stopProcess = async (proc: ChildProcess): Promise<void> => {
  proc.kill()

  await new Promise<void>((resolve) => {
    proc.once("exit", () => resolve())
    setTimeout(resolve, 1_000)
  })
}

export const probeCursorSessionLoad = async ({
  agentPath,
  workspaceDir,
}: {
  agentPath: string
  workspaceDir: string
}): Promise<boolean> => {
  const proc = spawn(agentPath, ["acp"], { stdio: ["pipe", "pipe", "pipe"] })
  const reader = createInterface({ input: proc.stdout! })

  try {
    const initResult = (await sendRequest(proc, reader, "initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "agent-server-smoke-probe", version: "0.0.0" },
    })) as { agentCapabilities?: { loadSession?: boolean } }

    if (initResult.agentCapabilities?.loadSession !== true) {
      return false
    }

    await sendRequest(proc, reader, "authenticate", { methodId: "cursor_login" })

    const created = (await sendRequest(proc, reader, "session/new", {
      cwd: workspaceDir,
      mcpServers: [],
    })) as { sessionId: string }

    await sendRequest(proc, reader, "session/load", {
      sessionId: created.sessionId,
      cwd: workspaceDir,
      mcpServers: [],
    })

    return true
  } catch {
    return false
  } finally {
    reader.close()
    await stopProcess(proc)
  }
}
