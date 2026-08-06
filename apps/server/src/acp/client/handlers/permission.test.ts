import { describe, expect, test } from "bun:test"
import { createAcpPermissionHandler } from "./permission"

describe("createAcpPermissionHandler", () => {
  test("delegates permission requests to the permission service", async () => {
    let registered: unknown = null
    const handlers = createAcpPermissionHandler({
      permissionService: {
        registerPending: async (input) => {
          registered = input
        },
        resolvePending: () => ({ ok: false, kind: "not_found" }),
        clearSessionPending: () => undefined,
        listPendingForSession: () => [],
        countPendingForSession: () => 0,
      },
    })

    await handlers.handlePermissionRequest({
      jsonRpcId: 42,
      params: { sessionId: "acp-1" },
      respond: () => undefined,
      respondError: () => undefined,
    })

    expect(registered).toMatchObject({
      jsonRpcId: 42,
      params: { sessionId: "acp-1" },
    })
  })
})
