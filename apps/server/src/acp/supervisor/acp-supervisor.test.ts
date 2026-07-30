import { afterEach, describe, expect, test } from "bun:test"
import { AgentId } from "contracts/http/agent-settings"
import { createAcpSupervisor } from "./acp-supervisor"
import { JsonRpcTransport } from "../transport/json-rpc-transport"
import { SpawnedAgentProcess } from "./spawn-agent-process"

const createMockTransport = () => {
  const handlers = new Map<string, (params: unknown) => unknown>()
  const notifications = new Map<string, Array<(params: unknown) => void>>()
  const notifyCalls: Array<{ method: string; params?: unknown }> = []
  const requestIds = [0]

  const transport: JsonRpcTransport = {
    allocateRequestId: () => {
      requestIds[0] += 1
      return requestIds[0]
    },
    request: async <T>(method: string, params?: unknown): Promise<T> => {
      const handler = handlers.get(method)
      if (!handler) {
        throw new Error(`no handler for ${method}`)
      }
      return handler(params) as T
    },
    notify: (method, params) => {
      notifyCalls.push({ method, params })
    },
    onNotification: (method, handler) => {
      const existing = notifications.get(method) ?? []
      notifications.set(method, [...existing, handler])
    },
    onRequest: () => undefined,
    onUnhandledRequest: () => undefined,
    onObserverEvent: () => undefined,
    respond: () => undefined,
    respondError: () => undefined,
    close: () => undefined,
  }

  return {
    transport,
    notifyCalls,
    setHandler: (method: string, handler: (params: unknown) => unknown) => {
      handlers.set(method, handler)
    },
    emitNotification: (method: string, params: unknown) => {
      const handlersForMethod = notifications.get(method) ?? []
      handlersForMethod.forEach((handler) => handler(params))
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

  test("createAcpSession updates activeSessions count", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: true } },
    }))
    mock.setHandler("authenticate", () => ({}))
    mock.setHandler("session/new", () => ({ sessionId: "acp-session-1" }))
    mock.setHandler("session/close", () => ({}))

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
    expect(supervisor.getStatus().activeSessions).toBe(0)

    const created = await supervisor.createAcpSession({
      workspaceCwd: "/tmp/ws",
      sessionId: "sess_test",
      workspaceId: "ws_test",
    })
    expect(created.ok).toBe(true)
    expect(supervisor.getStatus().activeSessions).toBe(1)

    if (created.ok) {
      const closed = await supervisor.closeAcpSession({ acpSessionId: created.acpSessionId })
      expect(closed.ok).toBe(true)
    }
    expect(supervisor.getStatus().activeSessions).toBe(0)
  })

  test("stop clears activeSessions to zero", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))
    mock.setHandler("session/new", () => ({ sessionId: "acp-session-2" }))

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
    await supervisor.createAcpSession({
      workspaceCwd: "/tmp/ws",
      sessionId: "sess_test",
      workspaceId: "ws_test",
    })
    expect(supervisor.getStatus().activeSessions).toBe(1)

    await supervisor.stop()
    expect(supervisor.getStatus().activeSessions).toBe(0)
  })

  test("promptAcpSession rejects unknown sessions", async () => {
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

    const result = await supervisor.promptAcpSession({
      acpSessionId: "missing-session",
      prompt: [{ type: "text", text: "hello" }],
    })

    expect(result).toEqual({ ok: false, reason: "Session is not bound" })
  })

  test("promptAcpSession forwards prompt payload to session/prompt", async () => {
    const mock = createMockTransport()
    const promptCalls: unknown[] = []
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))
    mock.setHandler("session/new", () => ({ sessionId: "acp-session-prompt" }))
    mock.setHandler("session/prompt", (params) => {
      promptCalls.push(params)
      return { stopReason: "end_turn" }
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

    await supervisor.start("cursor")
    await supervisor.createAcpSession({
      workspaceCwd: "/tmp/ws",
      sessionId: "sess_test",
      workspaceId: "ws_test",
    })

    const prompt = [{ type: "text", text: "hello" }]
    const result = await supervisor.promptAcpSession({
      acpSessionId: "acp-session-prompt",
      prompt,
    })

    expect(result).toEqual({ ok: true, result: { stopReason: "end_turn" } })
    expect(promptCalls).toEqual([
      { sessionId: "acp-session-prompt", prompt },
    ])
  })

  test("cancelAcpSession sends session/cancel as a notification", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))
    mock.setHandler("session/new", () => ({ sessionId: "acp-session-cancel" }))

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
    await supervisor.createAcpSession({
      workspaceCwd: "/tmp/ws",
      sessionId: "sess_test",
      workspaceId: "ws_test",
    })

    const result = await supervisor.cancelAcpSession({ acpSessionId: "acp-session-cancel" })

    expect(result).toEqual({ ok: true })
    expect(mock.notifyCalls).toEqual([
      { method: "session/cancel", params: { sessionId: "acp-session-cancel" } },
    ])
  })

  test("cancelAcpSession rejects unknown sessions", async () => {
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

    const result = await supervisor.cancelAcpSession({ acpSessionId: "missing-session" })

    expect(result).toEqual({ ok: false, reason: "Session is not bound" })
  })

  test("routes session/update notifications to onSessionUpdate", async () => {
    const mock = createMockTransport()
    const updates: Array<{ acpSessionId: string; update: unknown }> = []
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      onSessionUpdate: (input) => {
        updates.push(input)
      },
      spawnAgentProcessFn: () => createMockProcess(),
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    mock.emitNotification("session/update", {
      sessionId: "acp-session-update",
      update: { kind: "turn_complete" },
    })

    expect(updates).toEqual([
      {
        acpSessionId: "acp-session-update",
        update: { kind: "turn_complete" },
      },
    ])
  })
})
