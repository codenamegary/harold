import { afterEach, describe, expect, test } from "bun:test"
import { AgentId } from "contracts/http/agent-settings"
import {
  inventoryAdvertisesResumable,
  inventoryAdvertisesSessionClose,
  inventoryAdvertisesSessionList,
  inventoryEntry,
} from "../agent/inventory"
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
  args?: string[]
}>) => ({
  list: () =>
    agents.map((agent) => ({
      ...agent,
      args: agent.args ?? ["acp"],
    })),
})

const waitFor = async (predicate: () => boolean, timeoutMs = 2000) => {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

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
    expect(supervisor.getAgentRuntimeState("cursor")).toEqual({
      status: "stopped",
      error: null,
    })
    expect(supervisor.getRunningAgentId()).toBeNull()
    expect(supervisor.getCapabilityInventory("cursor")).toBeNull()
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
    expect(supervisor.getAgentRuntimeState("cursor")).toEqual({
      status: "ready",
      error: null,
    })
    expect(supervisor.getRunningAgentId()).toBe("cursor")
    const inventory = supervisor.getCapabilityInventory("cursor")
    expect(inventory).not.toBeNull()
    expect(inventoryAdvertisesResumable(inventory)).toBe(true)
    expect(inventoryAdvertisesSessionClose(inventory)).toBe(true)
    expect(inventoryAdvertisesSessionList(inventory)).toBe(false)
    expect(inventoryEntry(inventory, "loadSession")?.value).toBe(true)
  })

  test("starts a non-cursor catalog agent via generic profile", async () => {
    const mock = createMockTransport()
    const spawnCalls: Array<{
      command: readonly string[]
      executablePath: string
      args: readonly string[]
    }> = []
    mock.setHandler("initialize", () => ({
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: false,
        sessionCapabilities: { close: false },
      },
    }))
    mock.setHandler("authenticate", () => ({}))

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "opencode", enabled: true, path: "/usr/local/bin/opencode" },
      ]),
      serverVersion: "0.1.0",
      spawnAgentProcessFn: ({ profile, executablePath, args }) => {
        spawnCalls.push({ command: profile.command, executablePath, args })
        return createMockProcess()
      },
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("opencode")

    expect(supervisor.getStatus()).toEqual({ state: "ready", activeSessions: 0 })
    expect(supervisor.getRunningAgentId()).toBe("opencode")
    expect(spawnCalls).toEqual([
      {
        command: ["opencode", "acp"],
        executablePath: "/usr/local/bin/opencode",
        args: ["acp"],
      },
    ])
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
    expect(supervisor.getAgentRuntimeState("cursor")).toEqual({
      status: "error",
      error: "initialize failed",
    })
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
    expect(supervisor.getCapabilityInventory("cursor")).not.toBeNull()
    await supervisor.stop()

    expect(killed.value).toBe(true)
    expect(supervisor.getStatus().state).toBe("stopped")
    expect(supervisor.getCapabilityInventory("cursor")).toBeNull()
  })

  test("respawn stops a ready agent then starts it again", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: true, sessionCapabilities: { close: true, list: true } },
    }))
    mock.setHandler("authenticate", () => ({}))

    const spawnCount = { value: 0 }
    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      spawnAgentProcessFn: () => {
        spawnCount.value += 1
        return createMockProcess()
      },
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    await supervisor.respawn("cursor")

    expect(spawnCount.value).toBe(2)
    expect(supervisor.getAgentRuntimeState("cursor")).toEqual({
      status: "ready",
      error: null,
    })
  })

  test("stop and crash clearRuntime invoke onBeforeClearRuntime before bindings drop", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: true, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))
    mock.setHandler("session/new", () => ({ sessionId: "acp-bound-1" }))

    const exitResolvers: Array<(code: number | null) => void> = []
    const clearCalls: number[] = []
    const spawnCount = { value: 0 }

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      restartBackoffMs: [0],
      sleepFn: async () => undefined,
      onBeforeClearRuntime: () => {
        clearCalls.push(supervisor.getSessionBindingRegistry().count())
      },
      spawnAgentProcessFn: () => {
        spawnCount.value += 1
        return {
          ...createMockProcess(),
          waitForExit: () =>
            new Promise<number | null>((resolve) => {
              exitResolvers.push(resolve)
            }),
        }
      },
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    const created = await supervisor.createAcpSession({
      workspaceCwd: "/tmp/ws",
      sessionId: "sess_1",
      workspaceId: "ws_1",
    })
    expect(created.ok).toBe(true)
    expect(supervisor.getSessionBindingRegistry().count()).toBe(1)
    clearCalls.length = 0

    await supervisor.stop()
    expect(clearCalls).toEqual([1])
    expect(supervisor.getSessionBindingRegistry().count()).toBe(0)
    clearCalls.length = 0

    await supervisor.start("cursor")
    const recreated = await supervisor.createAcpSession({
      workspaceCwd: "/tmp/ws",
      sessionId: "sess_2",
      workspaceId: "ws_1",
    })
    expect(recreated.ok).toBe(true)
    expect(supervisor.getSessionBindingRegistry().count()).toBe(1)
    clearCalls.length = 0

    const resolveExit = exitResolvers.at(-1)
    expect(resolveExit).toBeDefined()
    resolveExit?.(1)

    await waitFor(() => supervisor.getStatus().state === "ready" && spawnCount.value >= 3)
    expect(clearCalls).toEqual([1])
    expect(supervisor.getSessionBindingRegistry().count()).toBe(0)
  })

  test("unexpected exit retries spawn with bounded backoff then reaches ready", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))

    const exitResolvers: Array<(code: number | null) => void> = []
    const sleeps: number[] = []
    const spawnCount = { value: 0 }
    const clearCalls: number[] = []

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      restartBackoffMs: [10, 20],
      sleepFn: async (ms) => {
        sleeps.push(ms)
      },
      onBeforeClearRuntime: () => {
        clearCalls.push(supervisor.getSessionBindingRegistry().count())
      },
      spawnAgentProcessFn: () => {
        spawnCount.value += 1
        if (spawnCount.value === 2) {
          throw new Error("spawn failed once")
        }
        return {
          ...createMockProcess(),
          waitForExit: () =>
            new Promise<number | null>((resolve) => {
              exitResolvers.push(resolve)
            }),
        }
      },
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    expect(spawnCount.value).toBe(1)

    exitResolvers[0]?.(1)
    await waitFor(() => supervisor.getStatus().state === "ready" && spawnCount.value >= 3)

    expect(sleeps).toEqual([10, 20])
    expect(spawnCount.value).toBe(3)
    expect(clearCalls).toEqual([0])
    expect(supervisor.getStatus().state).toBe("ready")
  })

  test("exhausted restart backoff leaves supervisor in error until later start", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))

    const exitResolvers: Array<(code: number | null) => void> = []
    const sleeps: number[] = []
    const spawnCount = { value: 0 }
    const clearCalls: number[] = []

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      restartBackoffMs: [5, 5, 5],
      sleepFn: async (ms) => {
        sleeps.push(ms)
      },
      onBeforeClearRuntime: () => {
        clearCalls.push(1)
      },
      spawnAgentProcessFn: () => {
        spawnCount.value += 1
        if (spawnCount.value >= 2 && spawnCount.value <= 4) {
          throw new Error("spawn unavailable")
        }
        return {
          ...createMockProcess(),
          waitForExit: () =>
            new Promise<number | null>((resolve) => {
              exitResolvers.push(resolve)
            }),
        }
      },
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    exitResolvers[0]?.(null)

    await waitFor(() => supervisor.getStatus().state === "error")
    expect(sleeps).toEqual([5, 5, 5])
    expect(spawnCount.value).toBe(4)
    expect(clearCalls).toEqual([1])

    await supervisor.start("cursor")
    expect(supervisor.getStatus().state).toBe("ready")
    expect(spawnCount.value).toBe(5)
  })

  test("restart sets starting during backoff attempts", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))

    const exitResolvers: Array<(code: number | null) => void> = []
    const releaseSleep = { resolve: null as (() => void) | null }
    const seenStarting = { value: false }

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      restartBackoffMs: [1],
      sleepFn: async () => {
        seenStarting.value = supervisor.getStatus().state === "starting"
        await new Promise<void>((resolve) => {
          releaseSleep.resolve = resolve
        })
      },
      spawnAgentProcessFn: () => ({
        ...createMockProcess(),
        waitForExit: () =>
          new Promise<number | null>((resolve) => {
            exitResolvers.push(resolve)
          }),
      }),
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    exitResolvers[0]?.(1)

    await waitFor(() => releaseSleep.resolve !== null)
    expect(supervisor.getStatus().state).toBe("starting")
    expect(seenStarting.value).toBe(true)

    releaseSleep.resolve?.()
    await waitFor(() => supervisor.getStatus().state === "ready")
  })

  test("dead-process exit with null code clears and restarts", async () => {
    const mock = createMockTransport()
    mock.setHandler("initialize", () => ({
      agentCapabilities: { loadSession: false, sessionCapabilities: { close: false } },
    }))
    mock.setHandler("authenticate", () => ({}))

    const exitResolvers: Array<(code: number | null) => void> = []
    const clearCalls: number[] = []

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      restartBackoffMs: [0],
      sleepFn: async () => undefined,
      onBeforeClearRuntime: () => {
        clearCalls.push(1)
      },
      spawnAgentProcessFn: () => ({
        ...createMockProcess(),
        waitForExit: () =>
          new Promise<number | null>((resolve) => {
            exitResolvers.push(resolve)
          }),
      }),
      createTransportFn: () => mock.transport,
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    exitResolvers[0]?.(null)

    await waitFor(() => clearCalls.length === 1)
    await waitFor(() => supervisor.getStatus().state === "ready")
    expect(clearCalls).toEqual([1])
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

  test("keeps two enabled agents ready at the same time", async () => {
    const cursorMock = createMockTransport()
    cursorMock.setHandler("initialize", () => ({
      agentCapabilities: {
        loadSession: false,
        sessionCapabilities: { close: false, list: {} },
      },
    }))
    cursorMock.setHandler("authenticate", () => ({}))

    const opencodeMock = createMockTransport()
    opencodeMock.setHandler("initialize", () => ({
      agentCapabilities: {
        loadSession: false,
        sessionCapabilities: { close: false, list: {} },
      },
    }))
    opencodeMock.setHandler("authenticate", () => ({}))

    const transportsByPath = new Map<string, JsonRpcTransport>([
      ["/bin/cursor", cursorMock.transport],
      ["/bin/opencode", opencodeMock.transport],
    ])
    const spawnedPaths: string[] = []

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/cursor" },
        { id: "opencode", enabled: true, path: "/bin/opencode" },
      ]),
      serverVersion: "0.1.0",
      spawnAgentProcessFn: ({ executablePath }) => {
        spawnedPaths.push(executablePath)
        return createMockProcess()
      },
      createTransportFn: () => {
        const path = spawnedPaths.at(-1)
        const transport = path === undefined ? undefined : transportsByPath.get(path)
        if (transport === undefined) {
          throw new Error(`missing transport for ${path}`)
        }
        return transport
      },
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    await supervisor.start("opencode")

    expect(supervisor.getRunningAgentIds()).toEqual(["cursor", "opencode"])
    expect(supervisor.getStatus().state).toBe("ready")
    const cursorInventory = supervisor.getCapabilityInventory("cursor")
    expect(inventoryAdvertisesResumable(cursorInventory)).toBe(false)
    expect(inventoryAdvertisesSessionClose(cursorInventory)).toBe(false)
    expect(inventoryAdvertisesSessionList(cursorInventory)).toBe(true)
    const opencodeInventory = supervisor.getCapabilityInventory("opencode")
    expect(inventoryAdvertisesResumable(opencodeInventory)).toBe(false)
    expect(inventoryAdvertisesSessionClose(opencodeInventory)).toBe(false)
    expect(inventoryAdvertisesSessionList(opencodeInventory)).toBe(true)
  })

  test("handleAgentDisabled stops one agent without stopping another", async () => {
    const cursorMock = createMockTransport()
    cursorMock.setHandler("initialize", () => ({
      agentCapabilities: {
        loadSession: false,
        sessionCapabilities: { close: false, list: {} },
      },
    }))
    cursorMock.setHandler("authenticate", () => ({}))

    const opencodeMock = createMockTransport()
    opencodeMock.setHandler("initialize", () => ({
      agentCapabilities: {
        loadSession: false,
        sessionCapabilities: { close: false, list: {} },
      },
    }))
    opencodeMock.setHandler("authenticate", () => ({}))

    const transportsByPath = new Map<string, JsonRpcTransport>([
      ["/bin/cursor", cursorMock.transport],
      ["/bin/opencode", opencodeMock.transport],
    ])
    const spawnedPaths: string[] = []
    const killedByPath = new Map<string, boolean>()

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/cursor" },
        { id: "opencode", enabled: true, path: "/bin/opencode" },
      ]),
      serverVersion: "0.1.0",
      spawnAgentProcessFn: ({ executablePath }) => {
        spawnedPaths.push(executablePath)
        return {
          ...createMockProcess(),
          kill: () => {
            killedByPath.set(executablePath, true)
          },
        }
      },
      createTransportFn: () => {
        const path = spawnedPaths.at(-1)
        const transport = path === undefined ? undefined : transportsByPath.get(path)
        if (transport === undefined) {
          throw new Error(`missing transport for ${path}`)
        }
        return transport
      },
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    await supervisor.start("opencode")
    await supervisor.handleAgentDisabled("cursor")

    expect(killedByPath.get("/bin/cursor")).toBe(true)
    expect(killedByPath.get("/bin/opencode")).toBeUndefined()
    expect(supervisor.getRunningAgentIds()).toEqual(["opencode"])
    expect(supervisor.getStatus().state).toBe("ready")
  })

  test("listAcpSessions unions session/list rows tagged with agentId", async () => {
    const cursorMock = createMockTransport()
    cursorMock.setHandler("initialize", () => ({
      agentCapabilities: {
        loadSession: false,
        sessionCapabilities: { close: false, list: {} },
      },
    }))
    cursorMock.setHandler("authenticate", () => ({}))
    cursorMock.setHandler("session/list", () => ({
      sessions: [
        {
          sessionId: "cursor-sess-1",
          cwd: "/tmp/a",
          title: "Cursor A",
          updatedAt: "2026-08-11T12:00:00.000Z",
        },
      ],
    }))

    const opencodeMock = createMockTransport()
    opencodeMock.setHandler("initialize", () => ({
      agentCapabilities: {
        loadSession: false,
        sessionCapabilities: { close: false, list: {} },
      },
    }))
    opencodeMock.setHandler("authenticate", () => ({}))
    opencodeMock.setHandler("session/list", () => ({
      sessions: [
        {
          sessionId: "opencode-sess-1",
          cwd: "/tmp/b",
          title: "OpenCode B",
          updatedAt: "2026-08-11T13:00:00.000Z",
        },
      ],
    }))

    const transportsByPath = new Map<string, JsonRpcTransport>([
      ["/bin/cursor", cursorMock.transport],
      ["/bin/opencode", opencodeMock.transport],
    ])
    const spawnedPaths: string[] = []

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/cursor" },
        { id: "opencode", enabled: true, path: "/bin/opencode" },
      ]),
      serverVersion: "0.1.0",
      spawnAgentProcessFn: ({ executablePath }) => {
        spawnedPaths.push(executablePath)
        return createMockProcess()
      },
      createTransportFn: () => {
        const path = spawnedPaths.at(-1)
        const transport = path === undefined ? undefined : transportsByPath.get(path)
        if (transport === undefined) {
          throw new Error(`missing transport for ${path}`)
        }
        return transport
      },
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    await supervisor.start("opencode")

    const listed = await supervisor.listAcpSessions()
    expect(listed).toEqual({
      ok: true,
      sessions: [
        {
          agentId: "cursor",
          sessionId: "cursor-sess-1",
          cwd: "/tmp/a",
          title: "Cursor A",
          updatedAt: "2026-08-11T12:00:00.000Z",
        },
        {
          agentId: "opencode",
          sessionId: "opencode-sess-1",
          cwd: "/tmp/b",
          title: "OpenCode B",
          updatedAt: "2026-08-11T13:00:00.000Z",
        },
      ],
    })
  })

  test("listAcpSessions returns ACP catalog rows after stop and start", async () => {
    const diskSessions = [
      {
        sessionId: "disk-sess-1",
        cwd: "/tmp/project",
        title: "Disk One",
        updatedAt: "2026-08-16T12:00:00.000Z",
      },
      {
        sessionId: "disk-sess-2",
        cwd: "/tmp/other",
        title: "Disk Two",
        updatedAt: "2026-08-16T13:00:00.000Z",
      },
    ]

    const createReadyMock = () => {
      const mock = createMockTransport()
      mock.setHandler("initialize", () => ({
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { close: true, list: {} },
        },
      }))
      mock.setHandler("authenticate", () => ({}))
      mock.setHandler("session/list", () => ({ sessions: diskSessions }))
      return mock
    }

    const firstMock = createReadyMock()
    const secondMock = createReadyMock()
    const transports = [firstMock.transport, secondMock.transport]
    const spawnCount = { value: 0 }

    const supervisor = createAcpSupervisor({
      agentSettingsRepository: createRepository([
        { id: "cursor", enabled: true, path: "/bin/agent" },
      ]),
      serverVersion: "0.1.0",
      spawnAgentProcessFn: () => createMockProcess(),
      createTransportFn: () => {
        const transport = transports[spawnCount.value]
        spawnCount.value += 1
        if (transport === undefined) {
          throw new Error("unexpected extra spawn")
        }
        return transport
      },
    })
    supervisors.push(supervisor)

    await supervisor.start("cursor")
    const before = await supervisor.listAcpSessions()
    expect(before.ok).toBe(true)
    if (!before.ok) {
      throw new Error(before.reason)
    }
    expect(before.sessions).toHaveLength(2)

    await supervisor.handleAgentDisabled("cursor")
    expect(supervisor.getRunningAgentIds()).toEqual([])

    await supervisor.start("cursor")
    const after = await supervisor.listAcpSessions()
    expect(after).toEqual({
      ok: true,
      sessions: [
        {
          agentId: "cursor",
          sessionId: "disk-sess-1",
          cwd: "/tmp/project",
          title: "Disk One",
          updatedAt: "2026-08-16T12:00:00.000Z",
        },
        {
          agentId: "cursor",
          sessionId: "disk-sess-2",
          cwd: "/tmp/other",
          title: "Disk Two",
          updatedAt: "2026-08-16T13:00:00.000Z",
        },
      ],
    })
    expect(spawnCount.value).toBe(2)
  })

  test("createSession calls session/new with cwd for the chosen agent", async () => {
    const mock = createMockTransport()
    const sessionNewCalls: unknown[] = []
    mock.setHandler("initialize", () => ({
      agentCapabilities: {
        loadSession: false,
        sessionCapabilities: { close: false, list: {} },
      },
    }))
    mock.setHandler("authenticate", () => ({}))
    mock.setHandler("session/new", (params) => {
      sessionNewCalls.push(params)
      return { sessionId: "catalog-sess-1" }
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
    const created = await supervisor.createSession({
      agentId: "cursor",
      cwd: "/tmp/project",
    })

    expect(created).toEqual({ ok: true, acpSessionId: "catalog-sess-1" })
    expect(sessionNewCalls).toEqual([{ cwd: "/tmp/project", mcpServers: [] }])
  })

  test("loadSession skips session/load when the session is already live from session/new", async () => {
    const mock = createMockTransport()
    const loadCalls: unknown[] = []
    mock.setHandler("initialize", () => ({
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { close: false, list: {} },
      },
    }))
    mock.setHandler("authenticate", () => ({}))
    mock.setHandler("session/new", () => ({ sessionId: "live-sess-1" }))
    mock.setHandler("session/load", (params) => {
      loadCalls.push(params)
      throw new Error('Session "[redacted]" not found')
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
    const created = await supervisor.createSession({
      agentId: "cursor",
      cwd: "/tmp/project",
    })
    expect(created).toEqual({ ok: true, acpSessionId: "live-sess-1" })

    const loaded = await supervisor.loadSession({
      agentId: "cursor",
      sessionId: "live-sess-1",
      cwd: "/tmp/project",
    })

    expect(loaded).toEqual({ ok: true, acpSessionId: "live-sess-1" })
    expect(loadCalls).toEqual([])
  })

  test("loadSession calls session/load for a session that is not already live", async () => {
    const mock = createMockTransport()
    const loadCalls: unknown[] = []
    mock.setHandler("initialize", () => ({
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { close: false, list: {} },
      },
    }))
    mock.setHandler("authenticate", () => ({}))
    mock.setHandler("session/load", (params) => {
      loadCalls.push(params)
      return { sessionId: "disk-sess-1" }
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
    const loaded = await supervisor.loadSession({
      agentId: "cursor",
      sessionId: "disk-sess-1",
      cwd: "/tmp/project",
    })

    expect(loaded).toEqual({ ok: true, acpSessionId: "disk-sess-1" })
    expect(loadCalls).toEqual([
      {
        sessionId: "disk-sess-1",
        cwd: "/tmp/project",
        mcpServers: [],
      },
    ])
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
      const closed = await supervisor.closeAcpSession({
        agentId: "cursor",
        sessionId: created.acpSessionId,
      })
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
    const updates: Array<{ agentId: string; acpSessionId: string; update: unknown }> = []
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
        agentId: "cursor",
        acpSessionId: "acp-session-update",
        update: { kind: "turn_complete" },
      },
    ])
  })
})
