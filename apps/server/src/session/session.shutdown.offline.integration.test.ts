import { afterEach, describe, expect, test } from "bun:test"
import { SessionSchema, CreateSessionResponseSchema } from "contracts/http/session"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { listen } from "../bootstrap/shutdown"
import { openDatabase } from "../persistence/database"
import { createEventJournalRepository } from "../event/journal.repository"
import { createSessionRepository } from "./repository"
import { createRuntime } from "../runtime/runtime"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import {
  cleanupTestAppResources,
  createFakeSpawnFn,
  createTempDataDir,
  createTestAppResources,
  enableAgent,
  seedWorkspace,
} from "../test-support/create-test-app"

const resources = createTestAppResources()

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 5000) => {
  const startedAt = Date.now()
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe("session offline on shutdown", () => {
  test("orderly shutdown marks a running session offline in SQLite", async () => {
    const dataDir = await createTempDataDir(resources)
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { spawnAgentProcessFn } = createFakeSpawnFn(resources, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "fake-session-shutdown-offline",
      sessionLoadSessionId: "fake-session-shutdown-offline",
      emitSessionUpdatesOnPrompt: true,
    })
    const { app, acpSupervisor, runtimeStatusService } = await createServer({
      config,
      runtime,
      database,
      whichFn,
      validateExecutablePathFn: () => true,
      spawnAgentProcessFn,
    })
    resources.addApp(app)

    await listen(app, config, runtimeStatusService)

    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        text: "Shutdown mid turn",
      },
    })
    expect(created.statusCode).toBe(201)
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "running"
    })

    const runningBeforeShutdown = SessionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: `/v1/sessions/${session.id}`,
          })
        ).body,
      ),
    )
    expect(runningBeforeShutdown.state).toBe("running")

    const { runShutdown } = await import("../bootstrap/shutdown")
    await runShutdown({
      app,
      database,
      acpSupervisor,
      runtimeStatusService,
      exit: () => {
        throw new Error("shutdown-exit")
      },
    }).catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "shutdown-exit") {
        throw error
      }
    })

    const readDatabase = openDatabase({ dataDir: config.dataDir })
    const sessionRepository = createSessionRepository(readDatabase)
    const journal = createEventJournalRepository(readDatabase)

    const fetched = sessionRepository.getById({ id: session.id })
    expect(fetched.ok).toBe(true)
    if (!fetched.ok) {
      return
    }

    expect(fetched.value.state).toBe("offline")
    expect(fetched.value.state).not.toBe("running")

    const records = journal.readAfter({ cursor: 0n, limit: 200 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    expect(
      records.value.some(
        (record) =>
          record.kind === "session.state" &&
          record.sessionId === session.id &&
          (record.payload as { state: string }).state === "offline",
      ),
    ).toBe(true)

    readDatabase.close()
  })
})
