import { afterEach, describe, expect, test } from "bun:test"
import { AgentId } from "contracts/http/agent-settings"
import { createAcpSupervisor } from "./acp-supervisor"
import { JsonRpcTransport } from "./json-rpc-transport"
import { SpawnedAgentProcess } from "./spawn-agent-process"

const createMockTransport = () => {
  const handlers = new Map<string, (params: unknown) => unknown>()
  const notifications = new Map<string, Array<(params: unknown) => void>>()

  const transport: JsonRpcTransport = {
    request: async <T>(method: string, params?: unknown): Promise<T> => {
      const handler = handlers.get(method)
      if (!handler) {
        throw new Error(`no handler for ${method}`)
      }
      return handler(params) as T
    },
    onNotification: (method, handler) => {
      const existing = notifications.get(method) ?? []
      notifications.set(method, [...existing, handler])
    },
    close: () => undefined,
  }

  return {
    transport,
    setHandler: (method: string, handler: (params: unknown) => unknown) => {
      handlers.set(method, handler)
    },
  }
}

const createMockProcess = (): SpawnedAgentProcess => ({
  stdin: { write: () => undefined },
  stdout: new ReadableStream(),
  kill: () => undefined,
  waitForExit: () => new Promise(() => undefined),
})

const createRepository = (agents: Array<{
  id: AgentId
  enabled: boolean
  path: string | null
}>) => ({
  list: () => agents,
})

describe("createAcpSupervisor", () => {
  const supervisors: Awaited<ReturnType<typeof createAcpSupervisor>>[] = []

  afterEach(async () => {
    await Promise.all(supervisors.splice(0).map((supervisor) => supervisor.stop()))
  })

  test("starts stopped and reports stopped status", () => {
    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([]),
      serverVersion: "0.1.0",
    })
    supervisors.push(supervisor)

    expect(supervisor.getStatus()).toEqual({ state: "stopped", activeSessions: 0 })
    expect(supervisor.getRunningAgentId()).toBeNull()
    expect(supervisor.getAgentCapabilities()).toBeNull()
  })

  test("rejects start when the agent is disabled or missing a path", async () => {
    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: false, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
    })
    supervisors.push(supervisor)

    await expect(supervisor.start("cursor")).rejects.toThrow("Agent is not enabled")
    expect(supervisor.getStatus().state).toBe("stopped")

    const missingPath = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: null },
      ]),
      serverVersion: "0.1.0",
    })
    supervisors.push(missingPath)

    await expect(missingPath.start("cursor")).rejects.toThrow("Agent executable path is not configured")
    expect(missingPath.getStatus().state).toBe("stopped")
  })

  test("runs initialize and authenticate then caches capabilities", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { close: true },
      },
    }))
    mock.setHandler("authenticate", () => ({}))

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      spawnAgentProcessFn: () => createMockProcess(),
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")

    expect(supervisor.getStatus()).toEqual({ state: "ready", activeSessions: 0 })
    expect(supervisor.getRunningAgentId()).toBe("cursor")
    expect(supervisor.getAgentCapabilities()).toEqual({
      loadSession: true,
      sessionCapabilities: { close: true },
    })
  })

  test("transitions to error when initialize fails", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => {
      throw new Error("initialize failed")
    })

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      spawnAgentProcessFn: () => createMockProcess(),
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await expect(supervisor.start("cursor")).rejects.toThrow("initialize failed")
    expect(supervisor.getStatus().state).toBe("error")
    expect(supervisor.getRunningAgentId()).toBeNull()
  })

  test("stop clears the child and returns to stopped", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))

    const killed = { value: false }
    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      spawnAgentProcessFn: () => ({
        ...createMockProcess(),
        kill: () => {
          killed.value = true
        },
      }),
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    await supervisor.stop()

    expect(killed.value).toBe(true)
    expect(supervisor.getStatus().state).toBe("stopped")
  })

  test("handleAgentDisabled stops a running matching agent", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      spawnAgentProcessFn: () => createMockProcess(),
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    await supervisor.handleAgentDisabled("cursor")

    expect(supervisor.getStatus().state).toBe("stopped")
  })
})
