import { afterEach, describe, expect, test } from "bun:test"
import { CreateSessionResponseSchema, SessionSchema } from "contracts/http/session"
import {
  acceptTestExecutablePath,
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
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

const waitForSessionState = async (
  app: Awaited<ReturnType<typeof createTestApp>>["app"],
  sessionId: string,
  expected: string,
  timeoutMs = 10_000,
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/sessions/${sessionId}`,
    })
    const session = SessionSchema.parse(JSON.parse(response.body))
    if (session.state === expected) {
      return session
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timed out waiting for session state ${expected}`)
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
    const { app, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: false },
        sessionNewSessionId: "crash-session",
        sessionLoadSessionId: "crash-session-loaded",
      },
    )
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        text: "Before crash",
      },
    })
    expect(createResponse.statusCode).toBe(201)
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

    const fake = resources.getLastFake()
    if (!fake) {
      throw new Error("expected fake ACP process to be tracked")
    }
    fake.kill()

    await waitForSessionState(app, created.id, "offline")
    await waitForSupervisorState(() => acpSupervisor.getStatus().state, "ready")
    expect(acpSupervisor.getStatus().state).toBe("ready")

    const recoveryResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        text: "After crash",
      },
    })
    const recovered = CreateSessionResponseSchema.parse(JSON.parse(recoveryResponse.body))
    expect(recoveryResponse.statusCode).toBe(201)
    expect(recovered.name).toBe("After crash")
    expect(acpSupervisor.getStatus().state).toBe("ready")
  })
})
