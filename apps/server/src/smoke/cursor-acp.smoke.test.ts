import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { LogCollectionSchema } from "contracts/http/logs"
import { CreateSessionResponseSchema, SessionCollectionSchema } from "contracts/http/session"
import {
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  SessionStreamServerMessageSchema,
} from "contracts/http/session.stream"
import { z } from "zod"
import { WebSocket } from "ws"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { websocketRawDataText } from "../auth/websocket.raw.data.text"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"

const CURSOR_SMOKE_TIMEOUT_MS = 180_000
const SUBSCRIBE_TIMEOUT_MS = 30_000
const PROMPT_TIMEOUT_MS = 90_000

const hasCliLogin = (): boolean => {
  try {
    const output = execSync("agent status", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return output.includes("Logged in")
  } catch {
    return false
  }
}

const hasCursorAuth = (): boolean =>
  Boolean(process.env.CURSOR_API_KEY ?? process.env.CURSOR_AUTH_TOKEN) || hasCliLogin()

const hasAgentBinary = (): boolean => {
  try {
    execSync("which agent", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const shouldRunSmoke =
  process.env.AGENT_SERVER_RUN_CURSOR_SMOKE === "1" && hasCursorAuth() && hasAgentBinary()

const allowWorkspaceRoots = async (
  app: Awaited<ReturnType<typeof createServer>>["app"],
  roots: string[],
) => {
  const response = await app.inject({
    method: "PATCH",
    url: "/v1/settings/runtime",
    payload: { allowedRoots: roots },
  })
  expect(response.statusCode).toBe(200)
}

const PermissionParamsSchema = z
  .object({
    options: z
      .array(
        z
          .object({
            optionId: z.string().min(1),
            name: z.string().min(1),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough()

const permissionAllowOptionId = (params: unknown): string => {
  const parsed = PermissionParamsSchema.parse(params)
  const allow = parsed.options.find(
    (option) =>
      option.optionId.toLowerCase().includes("allow") ||
      option.name.toLowerCase().includes("allow"),
  )
  if (allow !== undefined) {
    return allow.optionId
  }

  const first = parsed.options[0]
  if (first === undefined) {
    throw new Error("permission request has no options")
  }

  return first.optionId
}

const boundStreamUrl = (app: {
  server: { address: () => unknown }
}): string => {
  const address = app.server.address()
  if (address === null || typeof address === "string") {
    throw new Error("expected bound server address")
  }

  return `ws://127.0.0.1:${address.port}/v1/sessions/stream`
}

type StreamClient = {
  messages: SessionStreamServerMessage[]
  waitFor: (
    predicate: (message: SessionStreamServerMessage) => boolean,
    timeoutMs?: number,
  ) => Promise<SessionStreamServerMessage>
  send: (message: SessionStreamClientMessage) => void
  close: () => Promise<void>
}

const openStreamClient = (wsUrl: string): Promise<StreamClient> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const messages: SessionStreamServerMessage[] = []
    const waiters: Array<{
      predicate: (message: SessionStreamServerMessage) => boolean
      resolve: (message: SessionStreamServerMessage) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }> = []

    const describeMessages = () =>
      messages
        .map((message) =>
          message.type === "error" ? `error:${message.message}` : message.type,
        )
        .join(", ")

    const failWaiters = (error: Error) => {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer)
        waiter.reject(error)
      }
      waiters.splice(0, waiters.length)
    }

    const notify = (message: SessionStreamServerMessage) => {
      messages.push(message)
      const matched = waiters.filter((waiter) => waiter.predicate(message))
      for (const waiter of matched) {
        clearTimeout(waiter.timer)
        const index = waiters.indexOf(waiter)
        if (index >= 0) {
          waiters.splice(index, 1)
        }
        waiter.resolve(message)
      }
    }

    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout opening session stream"))
    }, 5_000)

    ws.addEventListener("open", () => {
      clearTimeout(timer)
      resolve({
        messages,
        send: (message) => {
          ws.send(JSON.stringify(message))
        },
        waitFor: (predicate, timeoutMs = 5_000) =>
          new Promise((waitResolve, waitReject) => {
            const existing = messages.find(predicate)
            if (existing !== undefined) {
              waitResolve(existing)
              return
            }

            const waiterTimer = setTimeout(() => {
              waitReject(
                new Error(
                  `timeout waiting for stream message after ${timeoutMs}ms. received: ${describeMessages()}`,
                ),
              )
            }, timeoutMs)
            waiters.push({
              predicate,
              resolve: waitResolve,
              reject: waitReject,
              timer: waiterTimer,
            })
          }),
        close: () =>
          new Promise((closeResolve) => {
            if (ws.readyState === WebSocket.CLOSED) {
              closeResolve()
              return
            }
            ws.addEventListener("close", () => closeResolve())
            ws.close()
          }),
      })
    })

    ws.on("message", (data) => {
      try {
        notify(
          SessionStreamServerMessageSchema.parse(
            JSON.parse(websocketRawDataText(data)),
          ),
        )
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : "parse failed"
        failWaiters(
          new Error(
            `invalid session stream message: ${reason}. raw=${websocketRawDataText(data)}`,
          ),
        )
      }
    })

    ws.addEventListener("unexpected-response", (_req, res) => {
      clearTimeout(timer)
      reject(new Error(`unexpected response ${res.statusCode}`))
    })
  })

const readLogsBody = async (
  app: Awaited<ReturnType<typeof createServer>>["app"],
): Promise<string> => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/logs?limit=200",
  })
  const parsed = LogCollectionSchema.safeParse(JSON.parse(response.body))
  if (!parsed.success) {
    return response.body
  }

  return parsed.data.items
    .map((item) => `${item.ts} ${item.level} ${item.source} ${item.message}`)
    .join("\n")
}

const failWithLogs = async (
  app: Awaited<ReturnType<typeof createServer>>["app"],
  client: StreamClient,
  label: string,
): Promise<never> => {
  const logs = await readLogsBody(app)
  throw new Error(
    `${label}\nstream messages: ${JSON.stringify(client.messages)}\nlogs:\n${logs}`,
  )
}

const drainPrompt = async (params: {
  app: Awaited<ReturnType<typeof createServer>>["app"]
  client: StreamClient
  deadlineMs: number
}): Promise<void> => {
  const { app, client, deadlineMs } = params
  const handledRequestIds = new Set<string>()

  const next = async (): Promise<void> => {
    const remainingMs = deadlineMs - Date.now()
    if (remainingMs <= 0) {
      await failWithLogs(app, client, "prompt did not complete before timeout")
    }

    const message = await client.waitFor((item) => {
      if (item.type === "prompt_complete" || item.type === "error") {
        return true
      }

      if (item.type === "permission_request" || item.type === "extension_request") {
        return !handledRequestIds.has(item.requestId)
      }

      return false
    }, remainingMs)

    if (message.type === "error") {
      await failWithLogs(app, client, `stream error during prompt: ${message.message}`)
    }

    if (message.type === "prompt_complete") {
      return
    }

    if (message.type === "permission_request") {
      handledRequestIds.add(message.requestId)
      client.send({
        type: "permission_reply",
        requestId: message.requestId,
        optionId: permissionAllowOptionId(message.params),
      })
      return next()
    }

    if (message.type === "extension_request") {
      handledRequestIds.add(message.requestId)
      client.send({
        type: "extension_reply",
        requestId: message.requestId,
        result: {},
      })
      return next()
    }

    await failWithLogs(app, client, `unexpected stream message ${message.type}`)
  }

  await next()
}

describe("cursor ACP smoke", () => {
  test.skipIf(!shouldRunSmoke)(
    "creates a Cursor session, lists it, then completes a stream prompt",
    async () => {
      const dataDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-cursor-smoke-"))
      const workspaceDir = path.join(dataDir, "smoke-project")
      await mkdir(workspaceDir)

      const detectedPath = execSync("which agent", { encoding: "utf8" }).trim()
      const whichFn: WhichFn = (binaryName) =>
        binaryName === "agent" ? detectedPath : undefined

      const config = parseConfig({
        AGENT_SERVER_HOST: "127.0.0.1",
        AGENT_SERVER_PORT: "0",
        AGENT_SERVER_DATA_DIR: dataDir,
      })
      const database = openDatabase({ dataDir: config.dataDir })
      const runtime = createRuntime("0.1.0")
      const { app, acpSupervisor } = await createServer({ config, runtime, database, whichFn })
      await app.listen({ host: config.host, port: config.port })

      try {
        const enableResponse = await app.inject({
          method: "PATCH",
          url: "/v1/settings/agents/cursor",
          payload: { enabled: true, path: detectedPath },
        })
        expect(enableResponse.statusCode).toBe(200)

        await allowWorkspaceRoots(app, [dataDir])

        const workspaceResponse = await app.inject({
          method: "POST",
          url: "/v1/workspaces",
          payload: { name: "Smoke workspace", path: workspaceDir },
        })
        expect(workspaceResponse.statusCode).toBe(201)

        const sessionResponse = await app.inject({
          method: "POST",
          url: "/v1/sessions",
          payload: { agentId: "cursor", cwd: workspaceDir },
        })
        expect(sessionResponse.statusCode).toBe(201)
        const session = CreateSessionResponseSchema.parse(JSON.parse(sessionResponse.body))

        const listResponse = await app.inject({
          method: "GET",
          url: `/v1/sessions?cwd=${encodeURIComponent(workspaceDir)}`,
        })
        expect(listResponse.statusCode).toBe(200)
        const listed = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
        expect(listed.items.some((item) => item.sessionId === session.sessionId)).toBe(true)

        const client = await openStreamClient(boundStreamUrl(app))
        try {
          client.send({
            type: "subscribe",
            agentId: "cursor",
            sessionId: session.sessionId,
          })

          const subscribed = await client.waitFor(
            (message) => message.type === "subscribed" || message.type === "error",
            SUBSCRIBE_TIMEOUT_MS,
          )
          if (subscribed.type === "error") {
            await failWithLogs(app, client, `subscribe failed: ${subscribed.message}`)
          }
          expect(subscribed).toMatchObject({
            type: "subscribed",
            agentId: "cursor",
            sessionId: session.sessionId,
          })

          client.send({
            type: "prompt",
            agentId: "cursor",
            sessionId: session.sessionId,
            text: "Reply with the single word pong and nothing else.",
          })

          await drainPrompt({
            app,
            client,
            deadlineMs: Date.now() + PROMPT_TIMEOUT_MS,
          })

          expect(client.messages.some((message) => message.type === "error")).toBe(false)
          expect(client.messages.some((message) => message.type === "prompt_complete")).toBe(
            true,
          )
        } finally {
          await client.close()
        }

        const deleteResponse = await app.inject({
          method: "DELETE",
          url: `/v1/sessions/${encodeURIComponent(session.sessionId)}?agentId=cursor`,
        })
        expect([204, 409]).toContain(deleteResponse.statusCode)
      } finally {
        await acpSupervisor.stop()
        await app.close()
        database.close()
        await rm(dataDir, { recursive: true, force: true })
      }
    },
    CURSOR_SMOKE_TIMEOUT_MS,
  )
})
