import { describe, expect, test } from "bun:test"
import { createSessionBindingRegistry } from "../acp/client/session-binding-registry"
import { createPermissionService } from "./service"

const turnId = "turn_01KZBHZYTYC67MG8E03KCY6NY0"

const createHarness = (journalFails = false) => {
  const bindingRegistry = createSessionBindingRegistry()
  bindingRegistry.bind({
    acpSessionId: "acp-1",
    sessionId: "sess-1",
    workspaceId: "ws-1",
    workspaceRoot: "/tmp",
    phase: "live",
    activeTurnId: turnId,
  })

  let responded = false

  const sessionRepository = {
    getById: ({ id }: { id: string }) =>
      id === "sess-1"
        ? ({ ok: true as const, value: { id, state: "awaiting-permission" as const } })
        : ({ ok: false as const }),
  }

  const sessionService = {
    markAwaitingPermission: () => ({ ok: true as const }),
    markRunning: () => ({ ok: true as const }),
  }

  const journalWriter = {
    appendAndPublish: () => (journalFails ? { ok: false as const } : { ok: true as const }),
    runTransactional: <T, E>(work: (tx: { append: () => { ok: true } | { ok: false } }) => T | E) => {
      const result = work({
        append: () => (journalFails ? { ok: false as const } : { ok: true as const }),
      })
      return { ok: true as const, value: result }
    },
  }

  const service = createPermissionService({
    getSessionBindingRegistry: () => bindingRegistry,
    sessionRepository: sessionRepository as never,
    sessionService: sessionService as never,
    journalWriter: journalWriter as never,
  })

  return { service, respond: () => responded, setResponded: (value: boolean) => {
    responded = value
  } }
}

const registerSamplePending = async (service: ReturnType<typeof createPermissionService>) => {
  let respondCalled = false
  await service.registerPending({
    jsonRpcId: 1,
    params: {
      sessionId: "acp-1",
      toolCall: { toolCallId: "tool-1", name: "fake-tool" },
      options: [
        { optionId: "allow-once", name: "Allow once" },
        { optionId: "reject-once", name: "Reject once" },
      ],
    },
    respond: () => {
      respondCalled = true
    },
    respondError: () => undefined,
  })

  const pending = service.listPendingForSession("sess-1")
  const requestId = pending[0]?.id
  if (requestId === undefined) {
    throw new Error("expected pending permission")
  }

  return { requestId, respondCalled: () => respondCalled }
}

describe("permission service", () => {
  test("resolvePending journals before answering ACP", async () => {
    let resolveJournalFails = false
    const bindingRegistry = createSessionBindingRegistry()
    bindingRegistry.bind({
      acpSessionId: "acp-1",
      sessionId: "sess-1",
      workspaceId: "ws-1",
      workspaceRoot: "/tmp",
      phase: "live",
      activeTurnId: turnId,
    })

    const journalWriter = {
      appendAndPublish: () => ({ ok: true as const }),
      runTransactional: <T, E>(work: (tx: { append: () => { ok: true } | { ok: false } }) => T | E) => {
        if (resolveJournalFails) {
          return { ok: false as const }
        }

        const result = work({ append: () => ({ ok: true as const }) })
        return { ok: true as const, value: result }
      },
    }

    const service = createPermissionService({
      getSessionBindingRegistry: () => bindingRegistry,
      sessionRepository: {
        getById: ({ id }: { id: string }) =>
          id === "sess-1"
            ? ({ ok: true as const, value: { id, state: "awaiting-permission" as const } })
            : ({ ok: false as const }),
      } as never,
      sessionService: {
        markAwaitingPermission: () => ({ ok: true as const }),
        markRunning: () => ({ ok: true as const }),
      } as never,
      journalWriter: journalWriter as never,
    })

    const registered = await registerSamplePending(service)
    resolveJournalFails = true

    const failed = service.resolvePending({
      sessionId: "sess-1",
      requestId: registered.requestId,
      body: { status: "resolved", optionId: "allow-once" },
    })
    expect(failed.ok).toBe(false)
    if (failed.ok) {
      return
    }
    expect(failed.kind).toBe("journal_failed")
    expect(registered.respondCalled()).toBe(false)
    expect(service.listPendingForSession("sess-1").length).toBe(1)

    resolveJournalFails = false
    const resolved = service.resolvePending({
      sessionId: "sess-1",
      requestId: registered.requestId,
      body: { status: "resolved", optionId: "reject-once" },
    })
    expect(resolved.ok).toBe(true)
    expect(registered.respondCalled()).toBe(true)
  })

  test("resolvePending rejects unknown options and duplicate resolves", async () => {
    const { service } = createHarness()
    const { requestId } = await registerSamplePending(service)

    const unknown = service.resolvePending({
      sessionId: "sess-1",
      requestId,
      body: { status: "resolved", optionId: "missing" },
    })
    expect(unknown.ok).toBe(false)
    if (unknown.ok) {
      return
    }
    expect(unknown.kind).toBe("validation")

    const first = service.resolvePending({
      sessionId: "sess-1",
      requestId,
      body: { status: "resolved", optionId: "allow-once" },
    })
    expect(first.ok).toBe(true)

    const duplicate = service.resolvePending({
      sessionId: "sess-1",
      requestId,
      body: { status: "resolved", optionId: "allow-once" },
    })
    expect(duplicate.ok).toBe(false)
    if (duplicate.ok) {
      return
    }
    expect(duplicate.kind).toBe("conflict")
  })

  test("resolvePending returns conflict for wrong session", async () => {
    const { service } = createHarness()
    const { requestId } = await registerSamplePending(service)

    const wrongSession = service.resolvePending({
      sessionId: "sess-other",
      requestId,
      body: { status: "resolved", optionId: "allow-once" },
    })
    expect(wrongSession.ok).toBe(false)
    if (wrongSession.ok) {
      return
    }
    expect(wrongSession.kind).toBe("conflict")
  })

  test("clearSessionPending rejects waiting callbacks without forcing running state", async () => {
    const { service } = createHarness()
    let errorMessage = ""
    await service.registerPending({
      jsonRpcId: 2,
      params: {
        sessionId: "acp-1",
        toolCall: { toolCallId: "tool-2", name: "fake-tool" },
        options: [{ optionId: "allow-once", name: "Allow once" }],
      },
      respond: () => undefined,
      respondError: (_code, message) => {
        errorMessage = message
      },
    })

    service.clearSessionPending("sess-1")
    expect(service.listPendingForSession("sess-1")).toEqual([])
    expect(errorMessage).toContain("cancelled")
  })
})
