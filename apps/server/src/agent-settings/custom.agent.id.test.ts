import { describe, expect, test } from "bun:test"
import {
  allocateCustomAgentId,
  allocateCustomDisplayName,
  customAgentIdFromDisplayName,
  isCustomAgentId,
  toKebabSlug,
} from "./custom.agent.id"

describe("isCustomAgentId", () => {
  test("detects custom-prefixed ids", () => {
    expect(isCustomAgentId("custom-custom-agent")).toBe(true)
    expect(isCustomAgentId("custom-my-bot")).toBe(true)
    expect(isCustomAgentId("custom")).toBe(true)
  })

  test("rejects catalog and registry-ahead ids", () => {
    expect(isCustomAgentId("cursor")).toBe(false)
    expect(isCustomAgentId("brand-new-agent")).toBe(false)
  })
})

describe("toKebabSlug", () => {
  test("slugifies display names", () => {
    expect(toKebabSlug("Custom Agent")).toBe("custom-agent")
    expect(toKebabSlug("Custom Agent 1")).toBe("custom-agent-1")
    expect(toKebabSlug("  My Cool Bot! ")).toBe("my-cool-bot")
  })
})

describe("customAgentIdFromDisplayName", () => {
  test("prefixes kebab slug with custom-", () => {
    expect(customAgentIdFromDisplayName("Custom Agent")).toBe("custom-custom-agent")
    expect(customAgentIdFromDisplayName("My Bot")).toBe("custom-my-bot")
  })
})

describe("allocateCustomAgentId", () => {
  test("returns base id when free", () => {
    expect(allocateCustomAgentId("Custom Agent", new Set())).toBe("custom-custom-agent")
  })

  test("suffixes on collision", () => {
    const existing = new Set(["custom-custom-agent", "custom-custom-agent-2"])
    expect(allocateCustomAgentId("Custom Agent", existing)).toBe("custom-custom-agent-3")
  })
})

describe("allocateCustomDisplayName", () => {
  test("uses Custom Agent then numbered suffixes", () => {
    expect(allocateCustomDisplayName(new Set())).toBe("Custom Agent")
    expect(allocateCustomDisplayName(new Set(["Custom Agent"]))).toBe("Custom Agent 1")
    expect(
      allocateCustomDisplayName(new Set(["Custom Agent", "Custom Agent 1"])),
    ).toBe("Custom Agent 2")
  })
})
