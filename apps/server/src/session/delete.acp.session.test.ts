import { describe, expect, test } from "bun:test"
import { AgentIdSchema } from "contracts/http/agent-settings"
import { buildCapabilityInventory } from "../acp/agent/inventory"
import { agentMethodDeclarations } from "../acp/agent/method.declarations"
import { deleteAcpSession } from "./delete.acp.session"

const agentId = AgentIdSchema.parse("cursor")

describe("deleteAcpSession", () => {
  test("returns after archive without waiting for session/close", async () => {
    const closeStarted = { value: false }
    const closeFinished = { value: false }
    const releaseClose = { resolve: () => undefined as void }
    const closeGate = new Promise<void>((resolve) => {
      releaseClose.resolve = resolve
    })

    const resultPromise = deleteAcpSession({
      agentId,
      sessionId: "sess-1",
      agentSettingsRepository: {
        list: () => [
          {
            id: agentId,
            displayName: "Cursor",
            available: true,
            enabled: true,
            path: "/usr/local/bin/agent",
            args: [],
            present: true,
            popular: true,
            deletable: false,
            state: { status: "stopped", error: null },
          },
        ],
      },
      acpSupervisor: {
        getRunningAgentIds: () => [agentId],
        start: async () => undefined,
        getCapabilityInventory: () =>
          buildCapabilityInventory({
            initializeResult: {
              agentCapabilities: {
                loadSession: true,
                sessionCapabilities: { close: true, list: true },
              },
            },
            declarations: agentMethodDeclarations,
          }),
        closeAcpSession: async () => {
          closeStarted.value = true
          await closeGate
          closeFinished.value = true
          return { ok: true }
        },
      },
      archivedAcpSessions: {
        isArchived: () => false,
        archive: () => undefined,
      },
    })

    const result = await resultPromise
    expect(result).toEqual({ ok: true })
    expect(closeStarted.value).toBe(true)
    expect(closeFinished.value).toBe(false)

    releaseClose.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(closeFinished.value).toBe(true)
  })
})
