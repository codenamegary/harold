import { describe, expect, test } from "bun:test"
import { createAcpPermissionHandler } from "./permission"

describe("createAcpPermissionHandler", () => {
  test("delegates permission requests to requestPermission and responds", async () => {
    const calls: unknown[] = []
    const responses: unknown[] = []
    const handlers = createAcpPermissionHandler({
      agentId: "cursor",
      requestPermission: async (input) => {
        calls.push(input)
        return {
          outcome: {
            outcome: "selected",
            optionId: "allow-once",
          },
        }
      },
    })

    await handlers.handlePermissionRequest({
      jsonRpcId: 42,
      params: { sessionId: "acp-1", options: [] },
      respond: (result) => {
        responses.push(result)
      },
      respondError: () => undefined,
    })

    expect(calls).toEqual([
      {
        agentId: "cursor",
        sessionId: "acp-1",
        params: { sessionId: "acp-1", options: [] },
      },
    ])
    expect(responses).toEqual([
      {
        outcome: {
          outcome: "selected",
          optionId: "allow-once",
        },
      },
    ])
  })

  test("rejects when sessionId is missing", async () => {
    const errors: Array<{ code: number; message: string }> = []
    const handlers = createAcpPermissionHandler({
      agentId: "cursor",
      requestPermission: async () => ({}),
    })

    await handlers.handlePermissionRequest({
      jsonRpcId: 1,
      params: {},
      respond: () => undefined,
      respondError: (code, message) => {
        errors.push({ code, message })
      },
    })

    expect(errors).toEqual([
      { code: -32000, message: "permission request missing session id" },
    ])
  })
})
