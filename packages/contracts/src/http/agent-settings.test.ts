import { describe, expect, test } from "bun:test"
import {
  AgentIdSchema,
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
  DetectAgentPathResponseSchema,
  ImportApplyBodySchema,
  ImportDetectResponseSchema,
  UpdateAgentSettingsBodySchema,
} from "./agent-settings"

const validAgentSettings = {
  id: "cursor",
  displayName: "Cursor",
  available: true,
  enabled: false,
  path: null,
  args: [] as string[],
  present: false,
  popular: true,
}

describe("AgentIdSchema", () => {
  test("accepts open string agent ids", () => {
    expect(AgentIdSchema.parse("cursor")).toBe("cursor")
    expect(AgentIdSchema.parse("registry-ahead-agent")).toBe("registry-ahead-agent")
  })

  test("rejects empty agent ids", () => {
    expect(() => AgentIdSchema.parse("")).toThrow()
  })
})

describe("AgentSettingsSchema", () => {
  test("accepts a valid agent settings record", () => {
    expect(AgentSettingsSchema.parse(validAgentSettings)).toEqual(validAgentSettings)
  })

  test("accepts path when enabled", () => {
    const settings = {
      ...validAgentSettings,
      enabled: true,
      path: "/usr/local/bin/agent",
      args: ["acp"],
      present: true,
    }

    expect(AgentSettingsSchema.parse(settings)).toEqual(settings)
  })

  test("accepts catalog agent ids beyond cursor", () => {
    const settings = {
      id: "claude-acp",
      displayName: "Claude Agent",
      available: true,
      enabled: false,
      path: null,
      args: ["@agentclientprotocol/claude-agent-acp@0.66.0"],
      present: true,
      popular: true,
    }

    expect(AgentSettingsSchema.parse(settings)).toEqual(settings)
  })

  test("accepts registry-ahead agent ids", () => {
    const settings = {
      id: "brand-new-agent",
      displayName: "Brand New",
      available: true,
      enabled: true,
      path: "/usr/bin/brand-new",
      args: ["acp"],
      present: true,
      popular: false,
    }

    expect(AgentSettingsSchema.parse(settings)).toEqual(settings)
  })

  test("rejects missing args", () => {
    const { args: _args, ...withoutArgs } = validAgentSettings
    expect(() => AgentSettingsSchema.parse(withoutArgs)).toThrow()
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

  test("accepts enable with args", () => {
    expect(
      UpdateAgentSettingsBodySchema.parse({
        enabled: true,
        args: ["acp"],
      }),
    ).toEqual({
      enabled: true,
      args: ["acp"],
    })
  })

  test("accepts enable with path and args", () => {
    expect(
      UpdateAgentSettingsBodySchema.parse({
        enabled: true,
        path: "/opt/agent/bin",
        args: ["acp", "--verbose"],
      }),
    ).toEqual({
      enabled: true,
      path: "/opt/agent/bin",
      args: ["acp", "--verbose"],
    })
  })

  test("accepts empty args array", () => {
    expect(
      UpdateAgentSettingsBodySchema.parse({
        enabled: true,
        args: [],
      }),
    ).toEqual({
      enabled: true,
      args: [],
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

  test("rejects args without enabled", () => {
    expect(() =>
      UpdateAgentSettingsBodySchema.parse({ args: ["acp"] }),
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

describe("ImportDetectResponseSchema", () => {
  test("accepts detect candidates", () => {
    const response = {
      items: [
        {
          id: "claude-acp",
          displayName: "Claude Agent",
          present: true,
          path: "/usr/bin/claude",
          inCatalog: true,
          alreadyEnabled: false,
          spawn: {
            kind: "npx",
            binaryName: "npx",
            command: ["npx", "@agentclientprotocol/claude-agent-acp@0.66.0"],
            displayName: "Claude Agent",
            authMethodId: "claude-acp",
          },
        },
      ],
    }

    expect(ImportDetectResponseSchema.parse(response)).toEqual(response)
  })
})

describe("ImportApplyBodySchema", () => {
  test("accepts apply selections", () => {
    const body = {
      agents: [
        {
          id: "brand-new-agent",
          path: "/usr/bin/brand-new",
          spawn: {
            kind: "binary",
            binaryName: "brand-new",
            command: ["brand-new", "acp"],
            displayName: "Brand New",
            authMethodId: "brand-new-agent",
          },
        },
      ],
    }

    expect(ImportApplyBodySchema.parse(body)).toEqual(body)
  })
})

describe("AgentSettingsCollectionSchema", () => {
  test("accepts a collection of agent settings", () => {
    const collection = {
      items: [
        validAgentSettings,
        {
          id: "claude-acp",
          displayName: "Claude Agent",
          available: true,
          enabled: false,
          path: null,
          args: [],
          present: false,
          popular: true,
        },
      ],
    }

    expect(AgentSettingsCollectionSchema.parse(collection)).toEqual(collection)
  })
})
