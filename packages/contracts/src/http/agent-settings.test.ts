import { describe, expect, test } from "bun:test"
import {
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
  DetectAgentPathResponseSchema,
  UpdateAgentSettingsBodySchema,
} from "./agent-settings"

const validAgentSettings = {
  id: "cursor",
  displayName: "Cursor",
  available: true,
  enabled: false,
  path: null,
} as const

describe("AgentSettingsSchema", () => {
  test("accepts a valid agent settings record", () => {
    expect(AgentSettingsSchema.parse(validAgentSettings)).toEqual(validAgentSettings)
  })

  test("accepts path when enabled", () => {
    const settings = {
      ...validAgentSettings,
      enabled: true,
      path: "/usr/local/bin/agent",
    }

    expect(AgentSettingsSchema.parse(settings)).toEqual(settings)
  })

  test("accepts unavailable claude settings", () => {
    const settings = {
      id: "claude",
      displayName: "Claude",
      available: false,
      enabled: false,
      path: null,
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

  test("accepts enable with path", () => {
    expect(
      UpdateAgentSettingsBodySchema.parse({
        enabled: true,
        path: "/opt/agent/bin",
      }),
    ).toEqual({
      enabled: true,
      path: "/opt/agent/bin",
    })
  })

  test("rejects null path", () => {
    expect(() =>
      UpdateAgentSettingsBodySchema.parse({ enabled: true, path: null }),
    ).toThrow()
  })

  test("rejects path without enabled", () => {
    expect(() =>
      UpdateAgentSettingsBodySchema.parse({ path: "/opt/agent/bin" }),
    ).toThrow()
  })

  test("rejects empty path", () => {
    expect(() =>
      UpdateAgentSettingsBodySchema.parse({ enabled: true, path: "" }),
    ).toThrow()
  })
})

describe("DetectAgentPathResponseSchema", () => {
  test("accepts a detected path", () => {
    expect(DetectAgentPathResponseSchema.parse({ path: "/usr/local/bin/agent" })).toEqual({
      path: "/usr/local/bin/agent",
    })
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
          path: null,
        },
      ],
    }

    expect(AgentSettingsCollectionSchema.parse(collection)).toEqual(collection)
  })
})
