import { describe, expect, test } from "bun:test"
import {
  createClaudeAuthAdapter,
  mapClaudeAuthStatus,
  parseClaudeAuthStatusJson,
} from "./claude.adapter"

describe("mapClaudeAuthStatus", () => {
  test("maps loggedIn true to authenticated", () => {
    expect(mapClaudeAuthStatus({ loggedIn: true })).toEqual({
      status: "authenticated",
      error: null,
    })
  })

  test("maps loggedIn false to needs_auth", () => {
    expect(mapClaudeAuthStatus({ loggedIn: false })).toEqual({
      status: "needs_auth",
      error: null,
    })
  })
})

describe("createClaudeAuthAdapter", () => {
  test("includes claude auth login instructions", () => {
    const adapter = createClaudeAuthAdapter({
      execFile: async () => ({ stdout: '{"loggedIn":false}', stderr: "" }),
    })
    const instructions = adapter.hostLoginInstructions({
      agentId: "claude-acp",
      hostIdentity: { id: "default" },
      hostMachineName: "dev-box",
      initializeResult: null,
    })

    expect(instructions).toContain("claude auth login")
    expect(instructions).toContain("dev-box")
  })

  test("probe maps claude auth status json", async () => {
    const adapter = createClaudeAuthAdapter({
      execFile: async () => ({ stdout: '{"loggedIn":true}', stderr: "" }),
    })
    const probe = await adapter.probe({
      agentId: "claude-acp",
      hostIdentity: { id: "default" },
      hostMachineName: "dev-box",
      initializeResult: null,
    })

    expect(probe.status).toBe("authenticated")
    expect(probe.canLogout).toBe(true)
  })

  test("parseClaudeAuthStatusJson accepts stdout", () => {
    expect(parseClaudeAuthStatusJson('{"loggedIn":true}')).toEqual({ loggedIn: true })
  })
})
