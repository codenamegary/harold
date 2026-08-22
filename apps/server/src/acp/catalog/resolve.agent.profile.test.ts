import { describe, expect, test } from "bun:test"
import { resolveAgentProfile } from "../agent-profile"
import { buildAgentSpawnCommand } from "../supervisor/spawn.agent.process"

describe("resolveAgentProfile", () => {
  test("preserves cursor product override command and auth", () => {
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
    })

    expect(buildAgentSpawnCommand("/opt/cursor/bin/agent", ["acp"])).toEqual([
      "/opt/cursor/bin/agent",
      "acp",
    ])
  })

  test("applies opencode auth method override", () => {
    const profile = resolveAgentProfile("opencode")
    if (profile === undefined) {
      throw new Error("expected opencode profile")
    }

    expect(profile).toEqual({
      id: "opencode",
      command: ["opencode", "acp"],
      authMethodId: "opencode-login",
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
        terminal: true,
      },
    })

    expect(buildAgentSpawnCommand("/usr/local/bin/opencode", ["acp"])).toEqual([
      "/usr/local/bin/opencode",
      "acp",
    ])
  })

  test("uses auggie native CLI override instead of registry npx package", () => {
    const profile = resolveAgentProfile("auggie")
    if (profile === undefined) {
      throw new Error("expected auggie profile")
    }

    expect(profile.command).toEqual(["auggie", "--acp"])
    expect(buildAgentSpawnCommand("/usr/local/bin/auggie", ["--acp"])).toEqual([
      "/usr/local/bin/auggie",
      "--acp",
    ])
  })

  test("builds a generic profile from a custom agent spawn snapshot", () => {
    const profile = resolveAgentProfile("custom-my-bot", {
      kind: "binary",
      binaryName: "/opt/my-bot",
      command: ["/opt/my-bot", "acp"],
      displayName: "My Bot",
      authMethodId: "custom-my-bot",
    })
    if (profile === undefined) {
      throw new Error("expected custom profile")
    }

    expect(profile.command).toEqual(["/opt/my-bot", "acp"])
    expect(profile.authMethodId).toBe("custom-my-bot")
  })
})
