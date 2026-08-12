import { afterEach, describe, expect, test } from "bun:test"
import { CreateSessionResponseSchema, SessionSchema } from "contracts/http/session"
import {
  acceptTestExecutablePath,
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
  seedBoundSession,
  seedWorkspace,
} from "../test-support/create-test-app"
import { WhichFn } from "../agent-settings/resolve-agent-path"

const resources = createTestAppResources()

const waitForSupervisorState = async (
  getState: () => string,
  expected: string,
  timeoutMs = 10_000,
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (getState() === expected) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timed out waiting for supervisor state ${expected}, got ${getState()}`)
}

const waitForSessionState = async (params: {
  app: Awaited<ReturnType<typeof createTestApp>>["app"]
  sessionId: string
  expected: string
  timeoutMs?: number
}) => {
  const timeoutMs = params.timeoutMs ?? 10_000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await params.app.inject({
      method: "GET",
      url: `/v1/sessions/${params.sessionId}`,
    })
    const session = SessionSchema.parse(JSON.parse(response.body))
    if (session.state === params.expected) {
      return session
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timed out waiting for session state ${params.expected}`)
}

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

describe("ACP crash recovery", () => {
  test("kills fake ACP, marks session offline, recovers via bounded backoff", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, acpSupervisor, database } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: false, sessionList: true },
        sessionNewSessionId: "crash-session",
        sessionLoadSessionId: "crash-session-loaded",
        emitSessionUpdatesOnPrompt: true,
        promptCompletionDelayMs: 5000,
      },
    )
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const seeded = await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Before crash",
    })

    const promptResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${seeded.sessionId}/prompt`,
      payload: { text: "Before crash" },
    })
    expect(promptResponse.statusCode).toBe(202)

    await waitForSessionState({
      app,
      sessionId: seeded.sessionId,
      expected: "running",
    })

    const fake = resources.getLastFake()
    if (!fake) {
      throw new Error("expected fake ACP process to be tracked")
    }
    fake.kill()

    await waitForSessionState({
      app,
      sessionId: seeded.sessionId,
      expected: "offline",
    })
    await waitForSupervisorState(() => acpSupervisor.getStatus().state, "ready")
    expect(acpSupervisor.getStatus().state).toBe("ready")

    const recoveryResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        agentId: "cursor",
        cwd: workspaceDir,
      },
    })
    const recovered = CreateSessionResponseSchema.parse(JSON.parse(recoveryResponse.body))
    expect(recoveryResponse.statusCode).toBe(201)
    expect(recovered.agentId).toBe("cursor")
    expect(recovered.cwd).toBe(workspaceDir)
    expect(acpSupervisor.getStatus().state).toBe("ready")
  })
})
