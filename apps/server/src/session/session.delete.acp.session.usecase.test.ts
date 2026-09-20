import { describe, expect, test } from "bun:test"
import { AgentIdSchema } from "contracts/http/agent-settings"
import { makeDeleteAcpSession } from "./session.delete.acp.session.usecase"

const agentId = AgentIdSchema.parse("cursor")

describe("makeDeleteAcpSession", () => {
  test("returns after archive without waiting for session/close", async () => {
    const closeStarted = { value: false }
    const closeFinished = { value: false }
    const releaseClose = { resolve: () => undefined as void }
    const closeGate = new Promise<void>((resolve) => {
      releaseClose.resolve = resolve
    })

    const forgotten: Array<{ agentId: typeof agentId; sessionId: string }> = []

    const deleteAcpSession = makeDeleteAcpSession({
      archivedAcpSessions: {
        isArchived: () => false,
        archive: () => undefined,
      },
      commandsCache: {
        remember: () => undefined,
        get: () => undefined,
        forget: (params) => {
          forgotten.push(params)
        },
      },
      ensureSupervisorReady: async () => ({ ok: true }),
      advertisesSessionClose: () => true,
      closeAcpSession: async () => {
        closeStarted.value = true
        await closeGate
        closeFinished.value = true
        return { ok: true }
      },
    })

    const result = await deleteAcpSession({ agentId, sessionId: "sess-1" })

    expect(result).toEqual({ ok: true })
    expect(forgotten).toEqual([{ agentId, sessionId: "sess-1" }])
    expect(closeStarted.value).toBe(true)
    expect(closeFinished.value).toBe(false)

    releaseClose.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(closeFinished.value).toBe(true)
  })

  test("skips session/close when the agent does not advertise it", async () => {
    let closed = false
    const deleteAcpSession = makeDeleteAcpSession({
      archivedAcpSessions: {
        isArchived: () => false,
        archive: () => undefined,
      },
      commandsCache: {
        remember: () => undefined,
        get: () => undefined,
        forget: () => undefined,
      },
      ensureSupervisorReady: async () => ({ ok: true }),
      advertisesSessionClose: () => false,
      closeAcpSession: async () => {
        closed = true
        return { ok: true }
      },
    })

    const result = await deleteAcpSession({ agentId, sessionId: "sess-1" })

    expect(result).toEqual({ ok: true })
    expect(closed).toBe(false)
  })

  test("still deletes when the supervisor fails to become ready", async () => {
    let closed = false
    const deleteAcpSession = makeDeleteAcpSession({
      archivedAcpSessions: {
        isArchived: () => false,
        archive: () => undefined,
      },
      commandsCache: {
        remember: () => undefined,
        get: () => undefined,
        forget: () => undefined,
      },
      ensureSupervisorReady: async () => ({
        ok: false,
        reason: "ACP supervisor failed to start",
      }),
      advertisesSessionClose: () => true,
      closeAcpSession: async () => {
        closed = true
        return { ok: true }
      },
    })

    const result = await deleteAcpSession({ agentId, sessionId: "sess-1" })

    expect(result).toEqual({ ok: true })
    expect(closed).toBe(false)
  })
})
