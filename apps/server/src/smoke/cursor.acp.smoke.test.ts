import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { CreateSessionResponseSchema, SessionCollectionSchema } from "contracts/http/session"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import {
  boundStreamUrl,
  drainPrompt,
  failWithLogs,
  openStreamClient,
} from "../test-support/session.stream.smoke"
import { allowWorkspaceRoots } from "../test-support/test.app"
import {
  hasCursorAuth,
  resolveCursorAgentPath,
  smokeRunRequested,
} from "../test-support/smoke.gate"
const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

const CURSOR_SMOKE_TIMEOUT_MS = 180_000
const SUBSCRIBE_TIMEOUT_MS = 30_000
const PROMPT_TIMEOUT_MS = 90_000

const shouldRunSmoke =
  smokeRunRequested() && hasCursorAuth() && resolveCursorAgentPath() !== undefined

describe("cursor ACP smoke", () => {
  test.skipIf(!shouldRunSmoke)(
    "creates a Cursor session, lists it, then completes a stream prompt",
    async () => {
      const dataDir = await mkdtemp(path.join(os.tmpdir(), "harold-cursor-smoke-"))
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
      const { app, acpSupervisor } = await createServer({
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

        await allowWorkspaceRoots(app, [dataDir])

        const workspaceResponse = await app.inject({
          headers: authHeaders(app),
          method: "POST",
          url: "/v1/workspaces",
          payload: { name: "Smoke workspace", path: workspaceDir },
        })
        expect(workspaceResponse.statusCode).toBe(201)

        const sessionResponse = await app.inject({
          headers: authHeaders(app),
          method: "POST",
          url: "/v1/sessions",
          payload: { agentId: "cursor", cwd: workspaceDir },
        })
        expect(sessionResponse.statusCode).toBe(201)
        const session = CreateSessionResponseSchema.parse(JSON.parse(sessionResponse.body))

        const listResponse = await app.inject({
          headers: authHeaders(app),
          method: "GET",
          url: `/v1/sessions?cwd=${encodeURIComponent(workspaceDir)}`,
        })
        expect(listResponse.statusCode).toBe(200)
        const listed = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
        expect(listed.items.some((item) => item.sessionId === session.sessionId)).toBe(true)

        const client = await openStreamClient(boundStreamUrl(app), device.credential)
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
            failWithLogs(logCapture, client, `subscribe failed: ${subscribed.message}`)
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
            logCapture,
            client,
            deadlineMs: Date.now() + PROMPT_TIMEOUT_MS,
          })

          expect(client.messages.some((message) => message.type === "error")).toBe(false)
          expect(client.messages.some((message) => message.type === "prompt_complete")).toBe(true)
        } finally {
          await client.close()
        }

        const deleteResponse = await app.inject({
          headers: authHeaders(app),
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
