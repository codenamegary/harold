import { afterEach, describe, expect, test } from "bun:test"
import { SessionSchema } from "contracts/http/session"
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
  timeoutMs = 5000,
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

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

describe("ACP crash recovery", () => {
  test("recovers on next session create after fake ACP subprocess exits", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, acpSupervisor } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: false },
      sessionNewSessionId: "crash-session",
      sessionLoadSessionId: "crash-session-loaded",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Before crash",
      },
    })
    expect(createResponse.statusCode).toBe(201)

    const fake = resources.lastFake
    if (!fake) {
      throw new Error("expected fake ACP process to be tracked")
    }
    fake.kill()

    await waitForSupervisorState(() => acpSupervisor.getStatus().state, "error")

    const recoveryResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "After crash",
      },
    })
    const recovered = SessionSchema.parse(JSON.parse(recoveryResponse.body))
    expect(recoveryResponse.statusCode).toBe(201)
    expect(recovered.name).toBe("After crash")
    expect(acpSupervisor.getStatus().state).toBe("ready")
  })
})
