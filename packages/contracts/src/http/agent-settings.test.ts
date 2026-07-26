import { describe, expect, test } from "bun:test"
import {
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
  UpdateAgentSettingsBodySchema,
} from "./agent-settings"

const validAgentSettings = {
  id: "cursor",
  displayName: "Cursor",
  available: true,
  enabled: false,
  detectedPath: null,
  pathOverride: null,
  effectivePath: null,
  resolutionStatus: "not_found",
} as const

describe("AgentSettingsSchema", () => {
  test("accepts a valid agent settings record", () => {
    expect(AgentSettingsSchema.parse(validAgentSettings)).toEqual(validAgentSettings)
  })

  test("accepts detected path fields when enabled", () => {
    const settings = {
      ...validAgentSettings,
      enabled: true,
      detectedPath: "/usr/local/bin/agent",
      effectivePath: "/usr/local/bin/agent",
      resolutionStatus: "detected",
    }

    expect(AgentSettingsSchema.parse(settings)).toEqual(settings)
  })

  test("accepts unavailable claude settings", () => {
    const settings = {
      id: "claude",
      displayName: "Claude",
      available: false,
      enabled: false,
      detectedPath: null,
      pathOverride: null,
      effectivePath: null,
      resolutionStatus: "unavailable",
    }

    expect(AgentSettingsSchema.parse(settings)).toEqual(settings)
  })

  test("rejects unknown agent id", () => {
    expect(() =>
      AgentSettingsSchema.parse({ ...validAgentSettings, id: "unknown" }),
    ).toThrow()
  })
})

describe("UpdateAgentSettingsBodySchema", () => {
  test("accepts enable only", () => {
    expect(UpdateAgentSettingsBodySchema.parse({ enabled: true })).toEqual({
      enabled: true,
    })
  })

  test("accepts path override", () => {
    expect(
      UpdateAgentSettingsBodySchema.parse({ pathOverride: "/opt/agent/bin" }),
    ).toEqual({
      pathOverride: "/opt/agent/bin",
    })
  })

  test("accepts null path override to clear", () => {
    expect(UpdateAgentSettingsBodySchema.parse({ pathOverride: null })).toEqual({
      pathOverride: null,
    })
  })

  test("rejects empty path override", () => {
    expect(() =>
      UpdateAgentSettingsBodySchema.parse({ pathOverride: "" }),
    ).toThrow()
  })
})

describe("AgentSettingsCollectionSchema", () => {
  test("accepts a collection of agent settings", () => {
    const collection = {
      items: [
        validAgentSettings,
        {
          id: "claude",
          displayName: "Claude",
          available: false,
          enabled: false,
          detectedPath: null,
          pathOverride: null,
          effectivePath: null,
          resolutionStatus: "unavailable",
        },
      ],
    }

    expect(AgentSettingsCollectionSchema.parse(collection)).toEqual(collection)
  })
})
