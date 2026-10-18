import { Writable } from "node:stream"
import { createServer } from "../bootstrap/server"
import { seedTestDevice, TestDeviceCredential } from "./test.harness"
import { toLogTailEntry } from "core/logs/tail.usecase"
import { sessionEventsPath } from "contracts/http/session.stream"
import { z } from "zod"
import {
  createSessionCommands,
  openSseStream,
  SessionCommands,
  SseStream,
} from "test-support/session-stream"

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

export const boundHttpBase = (app: { server: { address: () => unknown } }): string => {
  const address = app.server.address()
  if (
    address === null ||
    typeof address !== "object" ||
    !("port" in address) ||
    typeof address.port !== "number"
  ) {
    throw new Error("expected bound server address")
  }

  return `http://127.0.0.1:${address.port}`
}

export type StreamClient = SseStream

/** Opens the session event stream for a smoke run (opening the stream subscribes). */
export const openStreamClient = (params: {
  app: { server: { address: () => unknown } }
  credential: string
  agentId: string
  sessionId: string
}): Promise<SseStream> =>
  openSseStream({
    url: `${boundHttpBase(params.app)}${sessionEventsPath(params.sessionId, {
      agentId: params.agentId,
    })}`,
    credential: params.credential,
  })

/** REST commands for a smoke run against the bound app. */
export const smokeCommands = (params: {
  app: { server: { address: () => unknown } }
  credential: string
}): SessionCommands =>
  createSessionCommands({
    httpBase: boundHttpBase(params.app),
    credential: params.credential,
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

/** Answers permission and extension requests until the prompt completes or fails. */
export const drainPrompt = async (params: {
  logCapture: SmokeLogCapture
  client: StreamClient
  commands: SessionCommands
  deadlineMs: number
}): Promise<void> => {
  const { logCapture, client, commands, deadlineMs } = params
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
      const reply = await commands.replyPermission({
        requestId: message.requestId,
        optionId: permissionAllowOptionId(message.params),
      })
      if (reply.status !== 204) {
        failWithLogs(
          logCapture,
          client,
          `permission reply failed: ${reply.status} ${await reply.text()}`,
        )
      }
      return next()
    }

    if (message.type === "extension_request") {
      handledRequestIds.add(message.requestId)
      const reply = await commands.replyExtension({ requestId: message.requestId, result: {} })
      if (reply.status !== 204) {
        failWithLogs(
          logCapture,
          client,
          `extension reply failed: ${reply.status} ${await reply.text()}`,
        )
      }
      return next()
    }

    failWithLogs(logCapture, client, `unexpected stream message ${message.type}`)
  }

  await next()
}
