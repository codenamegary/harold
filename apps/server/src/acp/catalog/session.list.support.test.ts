import { describe, expect, test } from "bun:test"
import {
  AGENTS_WITHOUT_SESSION_LIST,
  agentSupportsSessionList,
} from "./session.list.support"

describe("session list support seed", () => {
  test("marks known matrix-no agents as unsupported", () => {
    expect(AGENTS_WITHOUT_SESSION_LIST.has("gemini")).toBe(true)
    expect(agentSupportsSessionList("gemini")).toBe(false)
    expect(agentSupportsSessionList("cline")).toBe(false)
  })

  test("allows cursor and opencode", () => {
    expect(agentSupportsSessionList("cursor")).toBe(true)
    expect(agentSupportsSessionList("opencode")).toBe(true)
  })
})
