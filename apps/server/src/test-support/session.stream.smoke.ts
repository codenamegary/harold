import { Writable } from "node:stream"
import { createServer } from "../bootstrap/server"
import { seedTestDevice, TestDeviceCredential } from "./test.harness"
import { toLogTailEntry } from "core/logs/tail.usecase"
import {
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  SessionStreamServerMessageSchema,
} from "contracts/http/session.stream"
import { z } from "zod"
import { WebSocket } from "ws"
import { websocketRawDataText } from "../auth/websocket.raw.data.text"

/**
 * Seeds a device row for a directly-created server app and exposes its
 * credential on the app instance so `authHeaders(app)` works in smoke tests.
 */
export const seedSmokeDevice = (
  app: Awaited<ReturnType<typeof createServer>>["app"],
  database: Parameters<typeof seedTestDevice>[0],
): TestDeviceCredential => {
  const device = seedTestDevice(database)
  return Object.assign(app, { deviceCredential: device }).deviceCredential
}

export const PermissionParamsSchema = z
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

export const permissionAllowOptionId = (params: unknown): string => {
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

export const boundStreamUrl = (app: { server: { address: () => unknown } }): string => {
  const address = app.server.address()
  if (
    address === null ||
    typeof address === "string" ||
    typeof address !== "object" ||
    !("port" in address) ||
    typeof address.port !== "number"
  ) {
    throw new Error("expected bound server address")
  }

  return `ws://127.0.0.1:${address.port}/v1/sessions/stream`
}

export type StreamClient = {
  messages: SessionStreamServerMessage[]
  waitFor: (
    predicate: (message: SessionStreamServerMessage) => boolean,
    timeoutMs?: number,
  ) => Promise<SessionStreamServerMessage>
  send: (message: SessionStreamClientMessage) => void
  close: () => Promise<void>
}

export const openStreamClient = (wsUrl: string, credential: string): Promise<StreamClient> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: { authorization: `Bearer ${credential}` },
    })
    const messages: SessionStreamServerMessage[] = []
    const waiters: Array<{
      predicate: (message: SessionStreamServerMessage) => boolean
      resolve: (message: SessionStreamServerMessage) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }> = []

    const describeMessages = () =>
      messages
        .map((message) => (message.type === "error" ? `error:${message.message}` : message.type))
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
        notify(SessionStreamServerMessageSchema.parse(JSON.parse(websocketRawDataText(data))))
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : "parse failed"
        failWaiters(
          new Error(`invalid session stream message: ${reason}. raw=${websocketRawDataText(data)}`),
        )
      }
    })

    ws.once("unexpected-response", (_req, res) => {
      clearTimeout(timer)
      reject(new Error(`unexpected response ${res.statusCode}`))
    })
  })

export type SmokeLogCapture = Readonly<{
  stream: Writable
  text: () => string
}>

/** Captures the daemon log stream so smoke failures can dump recent lines. */
export const createSmokeLogCapture = (): SmokeLogCapture => {
  const lines: string[] = []
  let leftover = ""
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      leftover += chunk.toString("utf8")
      const pieces = leftover.split("\n")
      leftover = pieces.pop() ?? ""
      lines.push(...pieces)
      callback()
    },
  })
  return {
    stream,
    text: () =>
      [...lines, leftover]
        .filter((line) => line.trim().length > 0)
        .map(toLogTailEntry)
        .map(
          (entry) =>
            `${entry.record.ts} ${entry.record.level} ${entry.record.source} ${entry.record.message}`,
        )
        .join("\n"),
  }
}

export const readLogsBody = (capture: SmokeLogCapture): string => capture.text()

export const failWithLogs = (
  capture: SmokeLogCapture,
  client: StreamClient,
  label: string,
): never => {
  const logs = readLogsBody(capture)
  throw new Error(`${label}\nstream messages: ${JSON.stringify(client.messages)}\nlogs:\n${logs}`)
}

export const drainPrompt = async (params: {
  logCapture: SmokeLogCapture
  client: StreamClient
  deadlineMs: number
}): Promise<void> => {
  const { logCapture, client, deadlineMs } = params
  const handledRequestIds = new Set<string>()

  const next = async (): Promise<void> => {
    const remainingMs = deadlineMs - Date.now()
    if (remainingMs <= 0) {
      failWithLogs(logCapture, client, "prompt did not complete before timeout")
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
      failWithLogs(logCapture, client, `stream error during prompt: ${message.message}`)
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

    failWithLogs(logCapture, client, `unexpected stream message ${message.type}`)
  }

  await next()
}
