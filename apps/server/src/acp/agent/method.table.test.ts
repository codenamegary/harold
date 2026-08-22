import { describe, expect, test } from "bun:test"
import { createAgentMethodTable } from "./method.table"
import { ANY_AGENT, AgentMethodHandler } from "./models"

const closeHandler = (reason: string): AgentMethodHandler<"session/close"> => {
  return async () => ({ ok: false, reason })
}

const listHandler = (): AgentMethodHandler<"session/list"> => {
  return async () => ({ ok: true, sessions: [] })
}

describe("agent method table", () => {
  test("resolves a wildcard handler for any agent", () => {
    const table = createAgentMethodTable()
    const handler = closeHandler("wildcard")

    table.register({ agentId: ANY_AGENT, method: "session/close", handler })

    expect(table.resolve({ agentId: "cursor", method: "session/close" })).toBe(handler)
    expect(table.resolve({ agentId: "opencode", method: "session/close" })).toBe(handler)
  })

  test("a concrete agent id wins over the wildcard for the same method", () => {
    const table = createAgentMethodTable()
    const fallback = closeHandler("wildcard")
    const cursorHandler = closeHandler("cursor")

    table.register({ agentId: ANY_AGENT, method: "session/close", handler: fallback })
    table.register({ agentId: "cursor", method: "session/close", handler: cursorHandler })

    expect(table.resolve({ agentId: "cursor", method: "session/close" })).toBe(cursorHandler)
    expect(table.resolve({ agentId: "opencode", method: "session/close" })).toBe(fallback)
  })

  test("resolving an unregistered method returns nothing", () => {
    const table = createAgentMethodTable()

    expect(table.resolve({ agentId: "cursor", method: "session/close" })).toBeUndefined()
  })

  test("the same method registered for two agents resolves independently", () => {
    const table = createAgentMethodTable()
    const cursorHandler = closeHandler("cursor")
    const opencodeHandler = closeHandler("opencode")

    table.register({ agentId: "cursor", method: "session/close", handler: cursorHandler })
    table.register({ agentId: "opencode", method: "session/close", handler: opencodeHandler })

    expect(table.resolve({ agentId: "cursor", method: "session/close" })).toBe(cursorHandler)
    expect(table.resolve({ agentId: "opencode", method: "session/close" })).toBe(opencodeHandler)
    expect(table.resolve({ agentId: "gemini", method: "session/close" })).toBeUndefined()
  })

  test("a registration for one method does not answer another method", () => {
    const table = createAgentMethodTable()

    table.register({ agentId: ANY_AGENT, method: "session/list", handler: listHandler() })

    expect(table.resolve({ agentId: "cursor", method: "session/close" })).toBeUndefined()
  })

  test("registering the same agent and method twice keeps the later handler", () => {
    const table = createAgentMethodTable()
    const first = closeHandler("first")
    const second = closeHandler("second")

    table.register({ agentId: "cursor", method: "session/close", handler: first })
    table.register({ agentId: "cursor", method: "session/close", handler: second })

    expect(table.resolve({ agentId: "cursor", method: "session/close" })).toBe(second)
  })

  test("tables are independent, so production stays empty when tests register handlers", () => {
    const table = createAgentMethodTable()
    table.register({ agentId: ANY_AGENT, method: "session/close", handler: closeHandler("one") })

    expect(
      createAgentMethodTable().resolve({ agentId: "cursor", method: "session/close" }),
    ).toBeUndefined()
  })
})
