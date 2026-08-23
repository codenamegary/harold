import { describe, expect, test } from "bun:test"
import {
  createCursorAuthAdapter,
  mapCursorAuthStatus,
  parseCursorAuthStatusJson,
} from "./cursor.adapter"

describe("mapCursorAuthStatus", () => {
  test("maps isAuthenticated true to authenticated", () => {
    expect(mapCursorAuthStatus({ isAuthenticated: true })).toEqual({
      status: "authenticated",
      error: null,
    })
  })

  test("maps isAuthenticated false to needs_auth", () => {
    expect(mapCursorAuthStatus({ isAuthenticated: false })).toEqual({
      status: "needs_auth",
      error: null,
    })
  })

  test("maps status authenticated when isAuthenticated omitted", () => {
    expect(mapCursorAuthStatus({ status: "authenticated" })).toEqual({
      status: "authenticated",
      error: null,
    })
  })
})

describe("createCursorAuthAdapter", () => {
  test("includes cursor-agent login instructions", () => {
    const adapter = createCursorAuthAdapter({
      execFile: async () => ({
        stdout: '{"isAuthenticated":false}',
        stderr: "",
      }),
    })
    const instructions = adapter.hostLoginInstructions({
      agentId: "cursor",
      hostIdentity: { id: "default" },
      hostMachineName: "dev-box",
      initializeResult: null,
    })

    expect(instructions).toContain("cursor-agent login")
    expect(instructions).toContain("dev-box")
  })

  test("probe maps cursor-agent status json", async () => {
    const adapter = createCursorAuthAdapter({
      execFile: async () => ({
        stdout: '{"status":"authenticated","isAuthenticated":true}',
        stderr: "",
      }),
    })
    const probe = await adapter.probe({
      agentId: "cursor",
      hostIdentity: { id: "default" },
      hostMachineName: "dev-box",
      initializeResult: null,
    })

    expect(probe.status).toBe("authenticated")
    expect(probe.canLogout).toBe(true)
  })

  test("parseCursorAuthStatusJson accepts stdout", () => {
    expect(parseCursorAuthStatusJson('{"isAuthenticated":true}')).toEqual({
      isAuthenticated: true,
    })
  })

  test("matches cursor agent id only", () => {
    const adapter = createCursorAuthAdapter({
      execFile: async () => ({ stdout: "{}", stderr: "" }),
    })
    expect(adapter.matches("cursor")).toBe(true)
    expect(adapter.matches("claude-acp")).toBe(false)
  })
})
