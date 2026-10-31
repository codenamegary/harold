import { describe, expect, test } from "bun:test"
import { createSessionBindingRegistry } from "../session.binding.registry"
import { createAcpElicitationHandler } from "./elicitation"

const boundRegistry = () => {
  const registry = createSessionBindingRegistry()
  registry.bind({
    acpSessionId: "acp-1",
    sessionId: "session-1",
    workspaceId: "workspace-1",
    workspaceRoot: "/tmp/workspace",
    phase: "live",
  })
  return registry
}

describe("createAcpElicitationHandler", () => {
  test("forwards session-scoped params and returns the raw result", async () => {
    const calls: unknown[] = []
    const responses: unknown[] = []
    const handler = createAcpElicitationHandler({
      agentId: "opencode",
      sessionBindingRegistry: boundRegistry(),
      requestElicitation: async (input) => {
        calls.push(input)
        return { action: "accept", content: { q0: "bun" } }
      },
    })

    const params = {
      mode: "form",
      sessionId: "acp-1",
      toolCallId: "call-1",
      message: "Questions",
      requestedSchema: { type: "object", properties: { q0: { type: "string" } } },
    }

    await handler.handleElicitationRequest({
      jsonRpcId: 42,
      params,
      respond: (result) => responses.push(result),
      respondError: () => undefined,
    })

    expect(calls).toEqual([
      {
        agentId: "opencode",
        sessionId: "acp-1",
        params,
        jsonRpcId: 42,
      },
    ])
    expect(responses).toEqual([{ action: "accept", content: { q0: "bun" } }])
  })

  test("rejects request-scoped elicitation with -32602", async () => {
    const errors: Array<{ code: number; message: string }> = []
    const handler = createAcpElicitationHandler({
      agentId: "opencode",
      sessionBindingRegistry: boundRegistry(),
      requestElicitation: async () => ({}),
    })

    await handler.handleElicitationRequest({
      jsonRpcId: 42,
      params: { mode: "form", requestId: 12, requestedSchema: {} },
      respond: () => undefined,
      respondError: (code, message) => errors.push({ code, message }),
    })

    expect(errors).toEqual([{ code: -32602, message: "elicitation request is not session-scoped" }])
  })

  test("rejects an unknown session binding with -32602", async () => {
    const errors: Array<{ code: number; message: string }> = []
    const handler = createAcpElicitationHandler({
      agentId: "opencode",
      sessionBindingRegistry: boundRegistry(),
      requestElicitation: async () => ({}),
    })

    await handler.handleElicitationRequest({
      jsonRpcId: 42,
      params: { mode: "form", sessionId: "acp-unknown", requestedSchema: {} },
      respond: () => undefined,
      respondError: (code, message) => errors.push({ code, message }),
    })

    expect(errors).toEqual([{ code: -32602, message: "unknown session binding" }])
  })
})
