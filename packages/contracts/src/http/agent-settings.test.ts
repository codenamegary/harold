import { describe, expect, test } from "bun:test"
import {
  AgentActionBodySchema,
  AgentIdSchema,
  AgentRuntimeStateSchema,
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
  DetectAgentPathResponseSchema,
  CreateCustomAgentBodySchema,
  ImportApplyBodySchema,
  ImportDetectResponseSchema,
  UpdateAgentSettingsBodySchema,
  stoppedAgentRuntimeState,
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
  deletable: false,
  sessionListSupported: true,
  state: stoppedAgentRuntimeState,
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
      deletable: false,
      sessionListSupported: true,
      state: stoppedAgentRuntimeState,
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
      deletable: true,
      sessionListSupported: true,
      state: {
        status: "ready",
        error: null,
      },
    }

    expect(AgentSettingsSchema.parse(settings)).toEqual(settings)
  })

  test("accepts error state with a reason", () => {
    const settings = {
      ...validAgentSettings,
      enabled: true,
      state: {
        status: "error",
        error: "ACP supervisor failed to start",
      },
    }

    expect(AgentSettingsSchema.parse(settings)).toEqual(settings)
  })

  test("rejects error state without a reason", () => {
    expect(() =>
      AgentRuntimeStateSchema.parse({
        status: "error",
        error: null,
      }),
    ).toThrow()
  })

  test("rejects a reason when status is not error", () => {
    expect(() =>
      AgentRuntimeStateSchema.parse({
        status: "ready",
        error: "still running",
      }),
    ).toThrow()
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

  test("accepts rename with displayName", () => {
    expect(UpdateAgentSettingsBodySchema.parse({ displayName: "My Bot" })).toEqual({
      displayName: "My Bot",
    })
  })

  test("rejects empty displayName", () => {
    expect(() => UpdateAgentSettingsBodySchema.parse({ displayName: "" })).toThrow()
  })
})

describe("AgentActionBodySchema", () => {
  test("accepts respawn", () => {
    expect(AgentActionBodySchema.parse({ type: "respawn" })).toEqual({
      type: "respawn",
    })
  })

  test("rejects unknown action types", () => {
    expect(() => AgentActionBodySchema.parse({ type: "restart" })).toThrow()
  })

  test("rejects extra fields on respawn", () => {
    expect(() =>
      AgentActionBodySchema.parse({ type: "respawn", force: true }),
    ).toThrow()
  })
})

describe("CreateCustomAgentBodySchema", () => {
  test("accepts empty body", () => {
    expect(CreateCustomAgentBodySchema.parse({})).toEqual({})
  })

  test("rejects unexpected fields", () => {
    expect(() => CreateCustomAgentBodySchema.parse({ displayName: "x" })).toThrow()
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
            command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp@0.66.0"],
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
          deletable: false,
          sessionListSupported: true,
          state: stoppedAgentRuntimeState,
        },
      ],
    }

    expect(AgentSettingsCollectionSchema.parse(collection)).toEqual(collection)
  })
})
