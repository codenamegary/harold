import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SessionCollectionSchema } from "contracts/http/session"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import {
  hasCursorAuth,
  resolveCursorAgentPath,
  resolveOpenCodePath,
  smokeRunRequested,
} from "../test-support/smoke.gate"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

const shouldRunSmoke =
  smokeRunRequested() && hasCursorAuth() && resolveCursorAgentPath() !== undefined

const shouldRunOpenCodeSmoke = smokeRunRequested() && resolveOpenCodePath() !== undefined

describe("ACP catalog session/list smoke", () => {
  test.skipIf(!shouldRunSmoke)("Cursor enable + GET /v1/sessions lists ACP rows", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "harold-catalog-cursor-smoke-"))
    const detectedPath = resolveCursorAgentPath()
    if (detectedPath === undefined) {
      throw new Error("agent binary missing")
    }

    const whichFn: WhichFn = (binaryName) => (binaryName === "agent" ? detectedPath : undefined)

    const config = parseConfig({
      HAROLD_HOST: "127.0.0.1",
      HAROLD_PORT: "0",
      HAROLD_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { app, acpSupervisor } = await createServer({ config, runtime, database, whichFn })

    try {
      const enableResponse = await app.inject({
        headers: authHeaders(app),
        method: "PATCH",
        url: "/v1/settings/agents/cursor",
        payload: { enabled: true, path: detectedPath },
      })
      expect(enableResponse.statusCode).toBe(200)
      expect(acpSupervisor.getRunningAgentIds()).toContain("cursor")

      const listResponse = await app.inject({
        headers: authHeaders(app),
        method: "GET",
        url: "/v1/sessions",
      })
      expect(listResponse.statusCode).toBe(200)
      const collection = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
      expect(Array.isArray(collection.items)).toBe(true)
      for (const item of collection.items) {
        expect(item.agentId).toBe("cursor")
        expect(item.sessionId.length).toBeGreaterThan(0)
      }
    } finally {
      await acpSupervisor.stop()
      await app.close()
      database.close()
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  test.skipIf(!shouldRunOpenCodeSmoke)(
    "OpenCode enable + GET /v1/sessions returns a catalog (empty list is fine)",
    async () => {
      const dataDir = await mkdtemp(path.join(os.tmpdir(), "harold-catalog-opencode-smoke-"))
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

      try {
        const enableResponse = await app.inject({
          headers: authHeaders(app),
          method: "PATCH",
          url: "/v1/settings/agents/opencode",
          payload: { enabled: true, path: detectedPath },
        })
        expect(enableResponse.statusCode).toBe(200)
        expect(acpSupervisor.getRunningAgentIds()).toContain("opencode")

        const listResponse = await app.inject({
          headers: authHeaders(app),
          method: "GET",
          url: "/v1/sessions",
        })
        expect(listResponse.statusCode).toBe(200)
        const collection = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
        expect(Array.isArray(collection.items)).toBe(true)
        for (const item of collection.items) {
          expect(item.agentId).toBe("opencode")
        }
      } finally {
        await acpSupervisor.stop()
        await app.close()
        database.close()
        await rm(dataDir, { recursive: true, force: true })
      }
    },
  )
})
