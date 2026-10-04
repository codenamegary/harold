import { describe, expect, test } from "bun:test"
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
  readLogsBody,
} from "../test-support/session.stream.smoke"
import { resolveOpenCodePath, smokeRunRequested } from "../test-support/smoke.gate"

const OPENCODE_SMOKE_TIMEOUT_MS = 180_000
const SUBSCRIBE_TIMEOUT_MS = 30_000
const PROMPT_TIMEOUT_MS = 90_000
const SESSION_CREATE_TIMEOUT_MS = 60_000
const SESSION_DELETE_TIMEOUT_MS = 30_000

const FREE_MODEL = process.env.OPENCODE_SMOKE_MODEL ?? "opencode/mimo-v2.5-free"

const shouldRunSmoke = smokeRunRequested() && resolveOpenCodePath() !== undefined

type SmokeServerApp = Awaited<ReturnType<typeof createServer>>["app"]

const injectWithTimeout = async (
  app: SmokeServerApp,
  options: { method: string; url: string; payload?: unknown },
  timeoutMs: number,
  label: string,
): Promise<{ statusCode: number; body: string }> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    )
  })
  try {
    return await Promise.race([app.inject(options), timeout])
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "request failed"
    const logs = await readLogsBody(app)
    throw new Error(`${reason}\nserver logs:\n${logs}`)
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

describe("opencode ACP smoke", () => {
  test.skipIf(!shouldRunSmoke)(
    "creates an OpenCode session, lists it, then completes a stream prompt on a free model",
    async () => {
      const dataDir = await mkdtemp(path.join(os.tmpdir(), "harold-opencode-smoke-"))
      const workspaceDir = path.join(dataDir, "smoke-project")
      await mkdir(workspaceDir)

      const previousConfigContent = process.env.OPENCODE_CONFIG_CONTENT
      process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        model: FREE_MODEL,
      })
      if (process.env.OPENCODE_API_KEY === "") {
        delete process.env.OPENCODE_API_KEY
      }

      const detectedPath = resolveOpenCodePath()
      if (detectedPath === undefined) {
        throw new Error("opencode binary missing")
      }
      const whichFn: WhichFn = (binaryName) =>
        binaryName === "opencode" ? detectedPath : undefined

      const config = parseConfig({
        HAROLD_HOST: "127.0.0.1",
        HAROLD_PORT: "0",
        HAROLD_DATA_DIR: dataDir,
      })
      const database = openDatabase({ dataDir: config.dataDir })
      const runtime = createRuntime("0.1.0")
      const { app, acpSupervisor } = await createServer({ config, runtime, database, whichFn })
      await app.listen({ host: config.host, port: config.port })

      try {
        const enableResponse = await app.inject({
          method: "PATCH",
          url: "/v1/settings/agents/opencode",
          payload: { enabled: true, path: detectedPath },
        })
        expect(enableResponse.statusCode).toBe(200)

        const allowResponse = await app.inject({
          method: "PATCH",
          url: "/v1/settings/runtime",
          payload: { allowedRoots: [dataDir] },
        })
        expect(allowResponse.statusCode).toBe(200)

        const workspaceResponse = await app.inject({
          method: "POST",
          url: "/v1/workspaces",
          payload: { name: "Smoke workspace", path: workspaceDir },
        })
        expect(workspaceResponse.statusCode).toBe(201)

        const sessionResponse = await injectWithTimeout(
          app,
          {
            method: "POST",
            url: "/v1/sessions",
            payload: { agentId: "opencode", cwd: workspaceDir },
          },
          SESSION_CREATE_TIMEOUT_MS,
          "POST /v1/sessions",
        )
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
            agentId: "opencode",
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
            agentId: "opencode",
            sessionId: session.sessionId,
          })

          client.send({
            type: "prompt",
            agentId: "opencode",
            sessionId: session.sessionId,
            text: "Reply with the single word pong and nothing else.",
          })

          await drainPrompt({
            app,
            client,
            deadlineMs: Date.now() + PROMPT_TIMEOUT_MS,
          })

          expect(client.messages.some((message) => message.type === "error")).toBe(false)
          expect(client.messages.some((message) => message.type === "prompt_complete")).toBe(true)
        } finally {
          await client.close()
        }

        const deleteResponse = await injectWithTimeout(
          app,
          {
            method: "DELETE",
            url: `/v1/sessions/${encodeURIComponent(session.sessionId)}?agentId=opencode`,
          },
          SESSION_DELETE_TIMEOUT_MS,
          "DELETE /v1/sessions",
        )
        expect([204, 409]).toContain(deleteResponse.statusCode)
      } finally {
        await acpSupervisor.stop()
        await app.close()
        database.close()
        await rm(dataDir, { recursive: true, force: true })
        if (previousConfigContent === undefined) {
          delete process.env.OPENCODE_CONFIG_CONTENT
        } else {
          process.env.OPENCODE_CONFIG_CONTENT = previousConfigContent
        }
      }
    },
    OPENCODE_SMOKE_TIMEOUT_MS,
  )
})
