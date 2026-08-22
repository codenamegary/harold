import { describe, expect, test } from "bun:test"
import {
  AgentCapabilityInventory,
  AgentCapabilityInventoryEntry,
} from "contracts/http/agent-settings"
import {
  agentCapabilitiesEmptyMessage,
  classifyAgentCapabilityEntry,
  formatAgentCapabilityAgentInfoLabel,
  formatAgentCapabilityMethodsLabel,
  groupAgentCapabilities,
} from "./group.agent.capabilities"

const entry = (
  overrides: Partial<AgentCapabilityInventoryEntry>,
): AgentCapabilityInventoryEntry => ({
  path: "loadSession",
  advertised: true,
  value: true,
  known: true,
  requiredBy: [],
  ...overrides,
})

describe("classifyAgentCapabilityEntry", () => {
  test("unknown when not known", () => {
    expect(
      classifyAgentCapabilityEntry(
        entry({ path: "_meta.foo", known: false, advertised: true }),
      ),
    ).toBe("unknown")
  })

  test("missing when required but not advertised", () => {
    expect(
      classifyAgentCapabilityEntry(
        entry({
          path: "sessionCapabilities.list",
          advertised: false,
          requiredBy: ["session/list"],
        }),
      ),
    ).toBe("missing")
  })

  test("active when required and advertised", () => {
    expect(
      classifyAgentCapabilityEntry(
        entry({ requiredBy: ["session/load"], advertised: true }),
      ),
    ).toBe("active")
  })

  test("recognized when advertised and not required", () => {
    expect(
      classifyAgentCapabilityEntry(
        entry({ path: "promptCapabilities.image", advertised: true }),
      ),
    ).toBe("recognized")
  })

  test("omits known paths the agent did not advertise when nothing requires them", () => {
    expect(
      classifyAgentCapabilityEntry(
        entry({ path: "promptCapabilities.audio", advertised: false }),
      ),
    ).toBeNull()
  })
})

describe("groupAgentCapabilities", () => {
  test("sorts entries into all four groups", () => {
    const inventory: AgentCapabilityInventory = {
      agentInfo: { name: "fake", version: "1.0.0", title: "Fake Agent" },
      entries: [
        entry({ path: "loadSession", requiredBy: ["session/load"] }),
        entry({
          path: "sessionCapabilities.list",
          advertised: false,
          requiredBy: ["session/list"],
        }),
        entry({ path: "promptCapabilities.image", advertised: true }),
        entry({ path: "_meta.vendor", known: false, advertised: true }),
      ],
    }

    expect(groupAgentCapabilities(inventory)).toEqual({
      missing: [inventory.entries[1]],
      active: [inventory.entries[0]],
      recognized: [inventory.entries[2]],
      unknown: [inventory.entries[3]],
    })
  })
})

describe("agentCapabilitiesEmptyMessage", () => {
  test("error state copy", () => {
    expect(
      agentCapabilitiesEmptyMessage({ status: "error", error: "spawn failed" }),
    ).toBe("Capabilities unavailable while the agent is in error.")
  })

  test("stopped state copy", () => {
    expect(agentCapabilitiesEmptyMessage({ status: "stopped", error: null })).toBe(
      "Capabilities appear when the agent is ready.",
    )
  })
})

describe("formatAgentCapabilityAgentInfoLabel", () => {
  test("prefers title over name", () => {
    expect(
      formatAgentCapabilityAgentInfoLabel({
        agentInfo: { name: "cursor", version: "2.0.0", title: "Cursor" },
        entries: [],
      }),
    ).toBe("Cursor 2.0.0")
  })

  test("falls back to name", () => {
    expect(
      formatAgentCapabilityAgentInfoLabel({
        agentInfo: { name: "cursor", version: "2.0.0" },
        entries: [],
      }),
    ).toBe("cursor 2.0.0")
  })
})

describe("formatAgentCapabilityMethodsLabel", () => {
  test("joins method names", () => {
    expect(formatAgentCapabilityMethodsLabel(["session/load", "session/close"])).toBe(
      "used by session/load, session/close",
    )
  })

  test("empty when no methods", () => {
    expect(formatAgentCapabilityMethodsLabel([])).toBe("")
  })
})
