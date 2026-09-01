import { describe, expect, test } from "bun:test"
import { AgentCapabilityInventorySchema } from "contracts/http/agent-settings"
import {
  advertisesCapability,
  supportsFileAttachments,
  supportsImageAttachments,
  PROMPT_IMAGE_CAPABILITY,
  PROMPT_EMBEDDED_CONTEXT_CAPABILITY,
} from "./capabilities"

const buildInventory = (agentCapabilities: unknown) =>
  AgentCapabilityInventorySchema.parse({
    agentInfo: { name: "agent", version: "1.0.0" },
    entries: [
      ...Object.entries(
        (agentCapabilities as Record<string, Record<string, unknown>>)
          .promptCapabilities ?? {},
      ).map(([key, value]) => ({
        path: `promptCapabilities.${key}`,
        advertised: true,
        value,
        known: true,
        requiredBy: [],
      })),
      { path: "loadSession", advertised: false, known: true, requiredBy: [] },
    ],
  })

describe("advertisesCapability", () => {
  test("true only when the agent declared the capability true", () => {
    const inventory = buildInventory({ promptCapabilities: { image: true } })
    expect(advertisesCapability(inventory, PROMPT_IMAGE_CAPABILITY)).toBe(true)
  })

  test("false when the agent declared it false", () => {
    const inventory = buildInventory({ promptCapabilities: { image: false } })
    expect(advertisesCapability(inventory, PROMPT_IMAGE_CAPABILITY)).toBe(false)
  })

  test("false when the path is absent from the inventory", () => {
    const inventory = buildInventory({})
    expect(advertisesCapability(inventory, PROMPT_EMBEDDED_CONTEXT_CAPABILITY)).toBe(
      false,
    )
  })

  test("false for null or missing inventory", () => {
    expect(advertisesCapability(null, PROMPT_IMAGE_CAPABILITY)).toBe(false)
    expect(
      advertisesCapability(undefined, PROMPT_IMAGE_CAPABILITY),
    ).toBe(false)
  })
})

describe("supportsImageAttachments", () => {
  test("follows promptCapabilities.image", () => {
    expect(
      supportsImageAttachments(buildInventory({ promptCapabilities: { image: true } })),
    ).toBe(true)
    expect(
      supportsImageAttachments(buildInventory({ promptCapabilities: { image: false } })),
    ).toBe(false)
    expect(supportsImageAttachments(null)).toBe(false)
  })
})

describe("supportsFileAttachments", () => {
  test("follows promptCapabilities.embeddedContext", () => {
    expect(
      supportsFileAttachments(
        buildInventory({ promptCapabilities: { embeddedContext: true } }),
      ),
    ).toBe(true)
    expect(supportsFileAttachments(buildInventory({}))).toBe(false)
  })
})
