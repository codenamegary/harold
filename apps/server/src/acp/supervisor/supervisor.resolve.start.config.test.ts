import { describe, expect, test } from "bun:test"
import { AgentSpawnSnapshot } from "contracts/http/agent-settings"
import { AgentSettingsReader } from "./models"
import { resolveStartConfig } from "./supervisor.resolve.start.config"

const spawnSnapshot: AgentSpawnSnapshot = {
  kind: "binary",
  binaryName: "registry-agent",
  command: ["/opt/tools/registry-agent", "--stdio"],
  displayName: "Registry Agent",
  authMethodId: "auth_none",
}

type ReaderSettings = { enabled?: boolean; path?: string | null; args?: string[] }

const makeReader = (
  settings?: ReaderSettings,
  snapshot?: AgentSpawnSnapshot,
): AgentSettingsReader => ({
  list: () =>
    settings === undefined
      ? []
      : [
          {
            id: "cursor",
            enabled: settings.enabled ?? true,
            path: settings.path !== undefined ? settings.path : "/usr/local/bin/cursor-agent",
            args: settings.args ?? ["--stdio"],
          },
        ],
  getSpawnSnapshot: snapshot === undefined ? undefined : () => snapshot,
})

describe("resolveStartConfig", () => {
  test("rejects an agent with no catalog profile and no spawn snapshot", () => {
    const result = resolveStartConfig(makeReader(), "not-a-known-agent")

    expect(result).toEqual({ ok: false, reason: "Agent profile is not available" })
  })

  test("rejects an agent that is missing from the settings list", () => {
    const result = resolveStartConfig(makeReader(), "cursor")

    expect(result).toEqual({ ok: false, reason: "Agent is not enabled" })
  })

  test("rejects a disabled agent", () => {
    const result = resolveStartConfig(makeReader({ enabled: false }), "cursor")

    expect(result).toEqual({ ok: false, reason: "Agent is not enabled" })
  })

  test("rejects an enabled agent with no executable path", () => {
    const result = resolveStartConfig(makeReader({ path: null }), "cursor")

    expect(result).toEqual({ ok: false, reason: "Agent executable path is not configured" })
  })

  test("resolves a catalog agent from its settings", () => {
    const result = resolveStartConfig(
      makeReader({ path: "/opt/cursor/agent", args: ["--experimental"] }),
      "cursor",
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.profile.id).toBe("cursor")
      expect(result.executablePath).toBe("/opt/cursor/agent")
      expect(result.args).toEqual(["--experimental"])
    }
  })

  test("resolves a registry-ahead agent from its spawn snapshot", () => {
    const reader: AgentSettingsReader = {
      list: () => [
        {
          id: "not-a-known-agent",
          enabled: true,
          path: "/opt/registry/agent",
          args: [],
        },
      ],
      getSpawnSnapshot: () => spawnSnapshot,
    }

    const result = resolveStartConfig(reader, "not-a-known-agent")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.profile.id).toBe("not-a-known-agent")
      expect(result.profile.command).toEqual(spawnSnapshot.command)
      expect(result.executablePath).toBe("/opt/registry/agent")
    }
  })
})
