import { afterEach, describe, expect, test } from "bun:test"
import { SessionSchema } from "contracts/http/session"
import { openDatabase } from "../persistence/database"
import { createServer } from "../bootstrap/server"
import { createRuntime } from "../runtime/runtime"
import { parseConfig } from "../config/config"
import {
  acceptTestExecutablePath,
  cleanupTestAppResources,
  createFakeSpawnFn,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
  seedBoundSession,
  seedWorkspace,
} from "../test-support/create-test-app"
import { WhichFn } from "../agent-settings/resolve-agent-path"

const resources = createTestAppResources()

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

describe("session restart and resume API", () => {
  test("session metadata survives restart and resume succeeds when fake advertises loadSession", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined

    const firstApp = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: false, sessionList: true },
      sessionNewSessionId: "restart-session",
      sessionLoadSessionId: "restart-session-loaded",
    })
    const { workspaceId, workspaceDir } = await seedWorkspace(firstApp.app, dataDir)
    await enableAgent(firstApp.app, "cursor", whichFn)

    const seeded = await seedBoundSession({
      database: firstApp.database,
      acpSupervisor: firstApp.acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Restart me",
    })

    const waitForIdle = async () => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < 5000) {
        const latest = await firstApp.app.inject({
          method: "GET",
          url: `/v1/sessions/${seeded.sessionId}`,
        })
        if (SessionSchema.parse(JSON.parse(latest.body)).state === "idle") {
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      throw new Error("timed out waiting for idle after create")
    }
    await waitForIdle()

    await firstApp.app.close()
    firstApp.database.close()

    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { spawnAgentProcessFn } = createFakeSpawnFn(resources, {
      capabilities: { loadSession: true, sessionClose: false, sessionList: true },
      sessionNewSessionId: "restart-session",
      sessionLoadSessionId: "restart-session-loaded",
    })
    const { app: secondApp } = await createServer({
      config,
      runtime,
      database,
      whichFn,
      validateExecutablePathFn: acceptTestExecutablePath,
      spawnAgentProcessFn,
    })
    resources.addApp(secondApp)

    const getBeforeResume = await secondApp.inject({
      method: "GET",
      url: `/v1/sessions/${seeded.sessionId}`,
    })
    const persisted = SessionSchema.parse(JSON.parse(getBeforeResume.body))
    expect(getBeforeResume.statusCode).toBe(200)
    expect(persisted.name).toBe("Restart me")

    await enableAgent(secondApp, "cursor", whichFn)

    const resumeResponse = await secondApp.inject({
      method: "POST",
      url: `/v1/sessions/${seeded.sessionId}/resume`,
    })
    const resumed = SessionSchema.parse(JSON.parse(resumeResponse.body))
    expect(resumeResponse.statusCode).toBe(200)
    expect(resumed.state).toBe("idle")
  })
})
