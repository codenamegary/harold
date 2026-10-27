import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { deflateSync } from "node:zlib"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { AttachmentDescriptorSchema } from "contracts/http/attachments"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import {
  createSmokeLogCapture,
  openStreamClient,
  seedSmokeDevice,
  smokeCommands,
} from "../test-support/session.stream.smoke"
import {
  hasCursorAuth,
  resolveCursorAgentPath,
  smokeRunRequested,
} from "../test-support/smoke.gate"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

const SUBSCRIBE_TIMEOUT_MS = 30_000
const PROMPT_DEADLINE_MS = 120_000

const shouldRunSmoke =
  smokeRunRequested() && hasCursorAuth() && resolveCursorAgentPath() !== undefined

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, data.length)
  const typeBytes = new TextEncoder().encode(type)
  const payload = new Uint8Array(typeBytes.length + data.length)
  payload.set(typeBytes)
  payload.set(data, typeBytes.length)
  const crc = new Uint8Array(4)
  new DataView(crc.buffer).setUint32(0, crc32(payload))
  const out = new Uint8Array(length.length + payload.length + crc.length)
  out.set(length)
  out.set(payload, length.length)
  out.set(crc, length.length + payload.length)
  return out
}

/** Minimal valid PNG: solid color, so the model can answer a color question. */
const createSolidPng = (size: number, rgb: [number, number, number]): Uint8Array => {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, size)
  new DataView(ihdr.buffer).setUint32(4, size)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor
  const scanline = new Uint8Array(size * 3 + size)
  for (let y = 0; y < size; y++) {
    scanline[y * (size * 3 + 1)] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const offset = y * (size * 3 + 1) + 1 + x * 3
      scanline[offset] = rgb[0]
      scanline[offset + 1] = rgb[1]
      scanline[offset + 2] = rgb[2]
    }
  }
  const parts = [
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanline)),
    pngChunk("IEND", new Uint8Array()),
  ]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const MULTIPART_BOUNDARY = "----haroldattachmentsmoke"

const uploadImage = (
  app: Awaited<ReturnType<typeof createServer>>["app"],
  sessionId: string,
  fileName: string,
  bytes: Uint8Array,
) => {
  const jsonPart = new TextEncoder().encode(
    `--${MULTIPART_BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`,
  )
  const tail = new TextEncoder().encode(`\r\n--${MULTIPART_BOUNDARY}--\r\n`)
  const payload = Buffer.concat([jsonPart, bytes, tail])
  return app.inject({
    method: "POST",
    url: `/v1/sessions/${sessionId}/attachments`,
    query: { agentId: "cursor" },
    payload,
    headers: {
      authorization: `Bearer ${app.deviceCredential.credential}`,
      "content-type": `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
    },
  })
}

const permissionAllowOptionId = (params: Record<string, unknown>): string => {
  const options = (params.options as Array<Record<string, unknown>>) ?? []
  const allow = options.find((option) => {
    const id = typeof option.optionId === "string" ? option.optionId.toLowerCase() : ""
    const name = typeof option.name === "string" ? option.name.toLowerCase() : ""
    return id.includes("allow") || name.includes("allow")
  })
  const chosen = allow ?? options[0]
  if (chosen === undefined) {
    throw new Error("permission request has no options")
  }
  return typeof chosen.optionId === "string" ? chosen.optionId : ""
}

const assistantTextFromMessages = (messages: Array<Record<string, unknown>>): string =>
  messages
    .filter((message) => message.type === "session_update")
    .map((message) => {
      const update = message.update
      return typeof update === "object" && update !== null
        ? (update as Record<string, unknown>)
        : undefined
    })
    .filter(
      (update) =>
        update !== undefined &&
        (update.sessionUpdate === "agent_message_chunk" || update.type === "agent_message_chunk"),
    )
    .map((update) => {
      const content: unknown = update.content
      if (Array.isArray(content)) {
        return content
          .map((part) =>
            typeof (part as { text?: unknown }).text === "string"
              ? (part as { text: string }).text
              : "",
          )
          .join("")
      }
      if (typeof content === "object" && content !== null && "text" in content) {
        const text = (content as { text?: unknown }).text
        return typeof text === "string" ? text : JSON.stringify(text)
      }
      return ""
    })
    .join("")

describe("cursor attachment smoke", () => {
  test.skipIf(!shouldRunSmoke)(
    "uploads an image, sends it with a prompt, and the agent sees it",
    async () => {
      const dataDir = await mkdtemp(path.join(os.tmpdir(), "harold-att-smoke-"))
      const workspaceDir = path.join(dataDir, "smoke-project")
      await mkdir(workspaceDir)

      const detectedPath = execSync("which agent", { encoding: "utf8" }).trim()
      const whichFn: WhichFn = (binaryName) => (binaryName === "agent" ? detectedPath : undefined)

      const config = parseConfig({
        HAROLD_HOST: "127.0.0.1",
        HAROLD_PORT: "0",
        HAROLD_DATA_DIR: dataDir,
      })
      const database = openDatabase({ dataDir: config.dataDir })
      const runtime = createRuntime("0.1.0")
      const logCapture = createSmokeLogCapture()
      const { app } = await createServer({
        config,
        runtime,
        database,
        whichFn,
        logStream: logCapture.stream,
      })
      const device = seedSmokeDevice(app, database)
      await app.listen({ host: config.host, port: config.port })

      try {
        const enableResponse = await app.inject({
          headers: authHeaders(app),
          method: "PATCH",
          url: "/v1/settings/agents/cursor",
          payload: { enabled: true, path: detectedPath },
        })
        expect(enableResponse.statusCode).toBe(200)

        const sessionResponse = await app.inject({
          headers: authHeaders(app),
          method: "POST",
          url: "/v1/sessions",
          payload: { agentId: "cursor", cwd: workspaceDir },
        })
        expect(sessionResponse.statusCode).toBe(201)
        const session = CreateSessionResponseSchema.parse(JSON.parse(sessionResponse.body))

        // Upload a solid red PNG through the real API surface.
        const png = createSolidPng(8, [220, 30, 30])
        const uploadResponse = await uploadImage(app, session.sessionId, "red-square.png", png)
        expect(uploadResponse.statusCode).toBe(201)
        const descriptor = AttachmentDescriptorSchema.parse(JSON.parse(uploadResponse.body))
        expect(descriptor.path.startsWith(path.join(workspaceDir, ".harold", "attachments"))).toBe(
          true,
        )

        const commands = smokeCommands({ app, credential: device.credential })
        const client = await openStreamClient({
          app,
          credential: device.credential,
          agentId: "cursor",
          sessionId: session.sessionId,
        })
        try {
          const subscribed = await client.waitFor(
            (message) => message.type === "subscribed" || message.type === "error",
            SUBSCRIBE_TIMEOUT_MS,
          )
          if (subscribed.type === "error") {
            throw new Error(`subscribe failed: ${String(subscribed.message)}`)
          }

          await commands.prompt({
            agentId: "cursor",
            sessionId: session.sessionId,
            text: "An image is attached. Look at its color. Reply with the single word red if the image is red, or the color name you see. Nothing else.",
            attachments: [
              {
                kind: "image",
                name: descriptor.name,
                mimeType: descriptor.mimeType,
                path: descriptor.path,
              },
            ],
          })

          // The turn must complete without a stream error (the reported bug:
          // agent errors out or goes silent on image attachments).
          const handledRequestIds = new Set<string>()
          const deadline = Date.now() + PROMPT_DEADLINE_MS
          for (;;) {
            const remaining = deadline - Date.now()
            expect(remaining).toBeGreaterThan(0)
            const message = await client.waitFor((item) => {
              if (
                item.type === "prompt_complete" ||
                item.type === "error" ||
                item.type === "permission_request" ||
                item.type === "extension_request"
              ) {
                return true
              }
              return false
            }, remaining)

            if (message.type === "error") {
              throw new Error(
                `stream error during attachment prompt: ${String(message.message)}\nmessages: ${JSON.stringify(client.messages.slice(-6))}`,
              )
            }
            if (message.type === "prompt_complete") {
              break
            }
            if (message.type === "permission_request") {
              handledRequestIds.add(String(message.requestId))
              await commands.replyPermission({
                requestId: message.requestId,
                optionId: permissionAllowOptionId(message.params as Record<string, unknown>),
              })
              continue
            }
            if (message.type === "extension_request") {
              handledRequestIds.add(String(message.requestId))
              await commands.replyExtension({ requestId: message.requestId, result: {} })
            }
          }

          // The agent must have actually received the image: it names the color.
          const assistantText = assistantTextFromMessages(client.messages)
          expect(assistantText.toLowerCase()).toContain("red")
        } finally {
          await client.close()
        }
      } finally {
        await app.close()
        await rm(dataDir, { recursive: true, force: true })
      }
    },
    180_000,
  )
})
