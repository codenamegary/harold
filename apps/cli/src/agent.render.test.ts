import { describe, expect, test } from "bun:test"
import { AgentSettings } from "contracts/http/agent-settings"
import {
  renderAgentList,
  renderAgentNotFound,
  renderAgentProbe,
  renderAgentProbes,
  renderAgentUpdateError,
} from "./agent.render"

const agentSettings = (overrides: Partial<AgentSettings> = {}): AgentSettings => ({
  id: "cursor",
  displayName: "Cursor",
  available: true,
  enabled: false,
  path: "/usr/local/bin/agent",
  args: ["acp"],
  present: true,
  popular: true,
  deletable: false,
  state: { status: "stopped", error: null },
  capabilities: null,
  authSummary: {
    status: "unknown",
    error: null,
    activeSessionId: null,
    canLogout: false,
  },
  ...overrides,
})

describe("renderAgentList", () => {
  test("renders the base agent columns", () => {
    const output = renderAgentList({
      items: [agentSettings({ id: "cursor", displayName: "Cursor", enabled: true })],
      probe: false,
    })

    expect(output).toContain("id")
    expect(output).toContain("displayName")
    expect(output).toContain("present")
    expect(output).toContain("enabled")
    expect(output).toContain("available")
    expect(output).toContain("auth")
    expect(output).toContain("cursor")
    expect(output).toContain("Cursor")
    expect(output).toContain("yes")
    expect(output).toContain("unknown")
  })

  test("adds path and runtime columns when probing", () => {
    const output = renderAgentList({
      items: [agentSettings()],
      probe: true,
    })

    expect(output).toContain("path")
    expect(output).toContain("runtime")
    expect(output).toContain("/usr/local/bin/agent")
    expect(output).toContain("stopped")
  })
})

describe("renderAgentProbe", () => {
  test("reports presence, path, enabled, runtime, and auth state", () => {
    const output = renderAgentProbe(
      agentSettings({
        enabled: true,
        path: "/opt/cursor/agent",
        state: { status: "ready", error: null },
        authSummary: {
          status: "authenticated",
          error: null,
          activeSessionId: "session-1",
          canLogout: true,
        },
      }),
    )

    expect(output).toContain("cursor")
    expect(output).toContain("Cursor")
    expect(output).toContain("present")
    expect(output).toContain("yes")
    expect(output).toContain("/opt/cursor/agent")
    expect(output).toContain("enabled")
    expect(output).toContain("runtime")
    expect(output).toContain("ready")
    expect(output).toContain("auth")
    expect(output).toContain("authenticated")
    expect(output).toContain("session-1")
  })

  test("renders multiple probes separated by a blank line", () => {
    const output = renderAgentProbes([
      agentSettings({ id: "cursor" }),
      agentSettings({ id: "opencode", displayName: "OpenCode" }),
    ])

    expect(output).toContain("cursor")
    expect(output).toContain("opencode")
    expect(output).toContain("\n\n")
  })
})

describe("renderAgentNotFound", () => {
  test("names the unknown agent id", () => {
    expect(renderAgentNotFound("nope")).toBe("Unknown agent id: nope")
  })
})

describe("renderAgentUpdateError", () => {
  test("maps expected enable/disable failures to CLI errors", () => {
    expect(renderAgentUpdateError({ kind: "not_found" })).toBe("Unknown agent id.")
    expect(renderAgentUpdateError({ kind: "cannot_enable" })).toBe(
      "Agent cannot be enabled in this release.",
    )
    expect(renderAgentUpdateError({ kind: "path_auto_detect_failed" })).toBe(
      "Could not detect the agent executable path automatically.",
    )
    expect(renderAgentUpdateError({ kind: "path_invalid", path: "/bad" })).toBe(
      "Invalid agent executable path: /bad",
    )
  })
})
