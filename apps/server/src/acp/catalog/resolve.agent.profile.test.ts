import { describe, expect, test } from "bun:test"
import { resolveAgentProfile } from "../agent-profile"
import { buildAgentSpawnCommand } from "../supervisor/spawn-agent-process"

describe("resolveAgentProfile", () => {
  test("preserves cursor product override command, auth, and extensions", () => {
    const profile = resolveAgentProfile("cursor")
    if (profile === undefined) {
      throw new Error("expected cursor profile")
    }

    expect(profile).toEqual({
      id: "cursor",
      command: ["agent", "acp"],
      authMethodId: "cursor_login",
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
        terminal: true,
      },
      extensionHandlers: profile.extensionHandlers,
    })

    expect(Object.keys(profile.extensionHandlers)).toEqual([
      "cursor/ask_question",
      "cursor/create_plan",
    ])

    expect(buildAgentSpawnCommand("/opt/cursor/bin/agent", ["acp"])).toEqual([
      "/opt/cursor/bin/agent",
      "acp",
    ])
  })

  test("builds a generic profile from catalog defaults for non-cursor agents", () => {
    const profile = resolveAgentProfile("opencode")
    if (profile === undefined) {
      throw new Error("expected opencode profile")
    }

    expect(profile).toEqual({
      id: "opencode",
      command: ["opencode", "acp"],
      authMethodId: "opencode",
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
        terminal: true,
      },
      extensionHandlers: {},
    })

    expect(buildAgentSpawnCommand("/usr/local/bin/opencode", ["acp"])).toEqual([
      "/usr/local/bin/opencode",
      "acp",
    ])
  })

  test("builds a generic profile from a registry-ahead spawn snapshot", () => {
    const profile = resolveAgentProfile("brand-new-agent", {
      kind: "binary",
      binaryName: "brand-new",
      command: ["brand-new", "acp"],
      displayName: "Brand New",
      authMethodId: "brand-new-agent",
    })
    if (profile === undefined) {
      throw new Error("expected registry-ahead profile")
    }

    expect(profile.command).toEqual(["brand-new", "acp"])
    expect(profile.authMethodId).toBe("brand-new-agent")
  })
})
