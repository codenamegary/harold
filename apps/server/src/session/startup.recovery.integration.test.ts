import { afterEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import {
  SessionSchema,
} from "contracts/http/session"
import { PROBLEM_TYPES, ConflictProblemSchema } from "contracts/http/error"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { openDatabase } from "../persistence/database"
import { sessions } from "../persistence/schema/sessions"
import { createServer } from "../bootstrap/server"
import { createRuntime } from "../runtime/runtime"
import { parseConfig } from "../config/config"
import { createEventJournalRepository } from "../event/journal.repository"
import { createSessionRepository } from "./repository"
import {
  cleanupTestAppResources,
  createFakeSpawnFn,
  createTempDataDir,
  createTestAppResources,
  enableAgent,
  seedBoundSession,
  seedWorkspace,
} from "../test-support/create-test-app"

const resources = createTestAppResources()

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 10_000) => {
  const startedAt = Date.now()
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const waitForSessionState = async (params: {
  app: { inject: (opts: { method: string; url: string }) => Promise<{ body: string }> }
  sessionId: string
  expected: string
}) => {
  await waitFor(async () => {
    const response = await params.app.inject({
      method: "GET",
      url: `/v1/sessions/${params.sessionId}`,
    })
    return SessionSchema.parse(JSON.parse(response.body)).state === params.expected
  })
}

const fakeAcpOptions = {
  capabilities: { loadSession: true, sessionClose: true, sessionList: true },
  sessionNewSessionId: "startup-recovery-session",
  sessionLoadSessionId: "startup-recovery-session-loaded",
  emitSessionUpdatesOnPrompt: true,
} as const

const seedRunningSession = async (params: {
  app: Awaited<ReturnType<typeof createFirstServer>>["app"]
  database: ReturnType<typeof openDatabase>
  acpSupervisor: Awaited<ReturnType<typeof createFirstServer>>["acpSupervisor"]
  workspaceId: string
  workspaceDir: string
  name: string
}) => {
  const seeded = await seedBoundSession({
    database: params.database,
    acpSupervisor: params.acpSupervisor,
    workspaceId: params.workspaceId,
    workspacePath: params.workspaceDir,
    agentId: "cursor",
    name: params.name,
  })

  const promptResponse = await params.app.inject({
    method: "POST",
    url: `/v1/sessions/${seeded.sessionId}/prompt`,
    payload: { text: params.name },
  })
  expect(promptResponse.statusCode).toBe(202)

  await waitForSessionState({
    app: params.app,
    sessionId: seeded.sessionId,
    expected: "running",
  })

  return seeded
}

const createFirstServer = async (dataDir: string) => {
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "0",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const { spawnAgentProcessFn } = createFakeSpawnFn(resources, fakeAcpOptions)
  const server = await createServer({
    config,
    runtime,
    database,
    whichFn,
    validateExecutablePathFn: () => true,
    spawnAgentProcessFn,
  })
  resources.addApp(server.app)
  return { ...server, config, database }
}

const createRestartedServer = async (
  dataDir: string,
  overrides: Parameters<typeof createFakeSpawnFn>[1] = {},
) => {
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "0",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const { spawnAgentProcessFn } = createFakeSpawnFn(resources, {
    ...fakeAcpOptions,
    ...overrides,
  })
  const server = await createServer({
    config,
    runtime,
    database,
    whichFn,
    validateExecutablePathFn: () => true,
    spawnAgentProcessFn,
  })
  resources.addApp(server.app)
  return { ...server, config, database }
}

const shutdownServer = async (params: {
  app: Awaited<ReturnType<typeof createServer>>["app"]
  database: ReturnType<typeof openDatabase>
  acpSupervisor: Awaited<ReturnType<typeof createServer>>["acpSupervisor"]
  runtimeStatusService: Awaited<ReturnType<typeof createServer>>["runtimeStatusService"]
  sessionService: Awaited<ReturnType<typeof createServer>>["sessionService"]
  disposeOfflineOnBindingClear: Awaited<
    ReturnType<typeof createServer>
  >["disposeOfflineOnBindingClear"]
}) => {
  const { runShutdown } = await import("../bootstrap/shutdown")
  await runShutdown({
    app: params.app,
    database: params.database,
    acpSupervisor: params.acpSupervisor,
    runtimeStatusService: params.runtimeStatusService,
    sessionService: params.sessionService,
    disposeOfflineOnBindingClear: params.disposeOfflineOnBindingClear,
    exit: () => {
      throw new Error("shutdown-exit")
    },
  }).catch((error: unknown) => {
    if (!(error instanceof Error) || error.message !== "shutdown-exit") {
      throw error
    }
  })
}

describe("startup recovery for former-running sessions", () => {
  test("auto-loads a former-running offline session to idle when supervisor becomes ready", async () => {
    const dataDir = await createTempDataDir(resources)
    const first = await createFirstServer(dataDir)
    const { workspaceId, workspaceDir } = await seedWorkspace(first.app, dataDir)
    await enableAgent(first.app, "cursor", whichFn)

    const seeded = await seedRunningSession({
      app: first.app,
      database: first.database,
      acpSupervisor: first.acpSupervisor,
      workspaceId,
      workspaceDir,
      name: "Recover on boot",
    })

    await shutdownServer(first)

    const readDatabase = openDatabase({ dataDir })
    const sessionRepository = createSessionRepository(readDatabase)
    const offline = sessionRepository.getById({ id: seeded.sessionId })
    expect(offline.ok).toBe(true)
    if (!offline.ok) {
      return
    }
    expect(offline.value.state).toBe("offline")
    readDatabase.close()

    const second = await createRestartedServer(dataDir)
    await enableAgent(second.app, "cursor", whichFn)
    await second.acpSupervisor.start("cursor")

    await waitForSessionState({
      app: second.app,
      sessionId: seeded.sessionId,
      expected: "idle",
    })

    expect(
      second.acpSupervisor
        .getSessionBindingRegistry()
        .getBinding("startup-recovery-session-loaded"),
    ).toBeDefined()
  })

  test("does not auto-load idle sessions at boot", async () => {
    const dataDir = await createTempDataDir(resources)
    const first = await createFirstServer(dataDir)
    const { workspaceId, workspaceDir } = await seedWorkspace(first.app, dataDir)
    await enableAgent(first.app, "cursor", whichFn)

    const seeded = await seedBoundSession({
      database: first.database,
      acpSupervisor: first.acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Idle stays waiting",
    })

    await waitForSessionState({
      app: first.app,
      sessionId: seeded.sessionId,
      expected: "idle",
    })

    await shutdownServer(first)

    const readDatabase = openDatabase({ dataDir })
    const row = readDatabase.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, seeded.sessionId))
      .get()
    expect(row?.state).toBe("idle")
    readDatabase.close()

    const second = await createRestartedServer(dataDir)
    await enableAgent(second.app, "cursor", whichFn)
    await second.acpSupervisor.start("cursor")

    await waitFor(async () => second.acpSupervisor.getStatus().state === "ready")

    const after = SessionSchema.parse(
      JSON.parse(
        (await second.app.inject({ method: "GET", url: `/v1/sessions/${seeded.sessionId}` })).body,
      ),
    )
    expect(after.state).toBe("idle")
    expect(
      second.acpSupervisor
        .getSessionBindingRegistry()
        .getBinding("startup-recovery-session-loaded"),
    ).toBeUndefined()
  })

  test("heals stale running on boot then auto-loads to idle", async () => {
    const dataDir = await createTempDataDir(resources)
    const first = await createFirstServer(dataDir)
    const { workspaceId, workspaceDir } = await seedWorkspace(first.app, dataDir)
    await enableAgent(first.app, "cursor", whichFn)

    const seeded = await seedBoundSession({
      database: first.database,
      acpSupervisor: first.acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Hard kill mid turn",
    })

    await waitForSessionState({
      app: first.app,
      sessionId: seeded.sessionId,
      expected: "idle",
    })

    first.disposeOfflineOnBindingClear()
    await first.acpSupervisor.stop()
    await first.app.close()
    first.database.close()

    const staleDatabase = openDatabase({ dataDir })
    staleDatabase.db
      .update(sessions)
      .set({ state: "running" })
      .where(eq(sessions.id, seeded.sessionId))
      .run()
    const staleRow = staleDatabase.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, seeded.sessionId))
      .get()
    expect(staleRow?.state).toBe("running")
    expect(staleRow?.resumable).toBe(true)
    staleDatabase.close()

    const second = await createRestartedServer(dataDir)
    await enableAgent(second.app, "cursor", whichFn)
    await second.acpSupervisor.start("cursor")

    await waitForSessionState({
      app: second.app,
      sessionId: seeded.sessionId,
      expected: "idle",
    })

    expect(
      second.acpSupervisor
        .getSessionBindingRegistry()
        .getBinding("startup-recovery-session-loaded"),
    ).toBeDefined()
  })

  test("failed load marks error, clears resumable, and keeps history", async () => {
    const dataDir = await createTempDataDir(resources)
    const first = await createFirstServer(dataDir)
    const { workspaceId, workspaceDir } = await seedWorkspace(first.app, dataDir)
    await enableAgent(first.app, "cursor", whichFn)

    const seeded = await seedRunningSession({
      app: first.app,
      database: first.database,
      acpSupervisor: first.acpSupervisor,
      workspaceId,
      workspaceDir,
      name: "Fail on recovery",
    })

    const journal = createEventJournalRepository(first.database)
    const recordsBefore = journal.readAfter({ cursor: 0n, limit: 200 })
    expect(recordsBefore.ok).toBe(true)
    if (!recordsBefore.ok) {
      return
    }
    const historyCountBefore = recordsBefore.value.length

    await shutdownServer(first)

    const second = await createRestartedServer(dataDir, { sessionLoadFails: true })
    await enableAgent(second.app, "cursor", whichFn)
    await second.acpSupervisor.start("cursor")

    await waitForSessionState({
      app: second.app,
      sessionId: seeded.sessionId,
      expected: "error",
    })

    const failed = SessionSchema.parse(
      JSON.parse(
        (await second.app.inject({ method: "GET", url: `/v1/sessions/${seeded.sessionId}` })).body,
      ),
    )
    expect(failed.name).toBe("Fail on recovery")

    const readDatabase = openDatabase({ dataDir })
    const row = readDatabase.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, seeded.sessionId))
      .get()
    expect(row?.resumable).toBe(false)

    const journalAfter = createEventJournalRepository(readDatabase)
    const recordsAfter = journalAfter.readAfter({ cursor: 0n, limit: 200 })
    expect(recordsAfter.ok).toBe(true)
    if (!recordsAfter.ok) {
      return
    }
    expect(recordsAfter.value.length).toBeGreaterThanOrEqual(historyCountBefore)
    readDatabase.close()

    const promptResponse = await second.app.inject({
      method: "POST",
      url: `/v1/sessions/${seeded.sessionId}/prompt`,
      payload: { text: "should fail" },
    })
    const problem = ConflictProblemSchema.parse(JSON.parse(promptResponse.body))
    expect(promptResponse.statusCode).toBe(409)
    expect(problem.type).toBe(PROBLEM_TYPES.conflict)
  })
})
