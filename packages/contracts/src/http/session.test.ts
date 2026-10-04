import { describe, expect, test } from "bun:test"
import {
  CancelSessionBodySchema,
  CancelSessionResponseSchema,
  CreateSessionBodySchema,
  CreateSessionResponseSchema,
  DeleteSessionQuerySchema,
  DeleteSessionParamsSchema,
  ListSessionsQuerySchema,
  PromptSessionBodySchema,
  PromptSessionResponseSchema,
  SessionCollectionSchema,
  SessionSchema,
  UpdateSessionBodySchema,
  deleteSessionPath,
  sessionPath,
} from "./session"

const validTurnId = "turn_01JFC8C7E77NQCFH0RF9Z22JHH"

const validSession = {
  id: "session-auth",
  workspaceId: "ws-harold",
  agentId: "cursor",
  name: "Auth flow",
  state: "idle",
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:05:00.000Z",
  archivedAt: null,
} as const

describe("SessionSchema", () => {
  test("accepts a valid session", () => {
    expect(SessionSchema.parse(validSession)).toEqual(validSession)
  })

  test("accepts catalog agent ids", () => {
    expect(SessionSchema.parse({ ...validSession, agentId: "cursor" }).agentId).toBe("cursor")
    expect(SessionSchema.parse({ ...validSession, agentId: "claude-acp" }).agentId).toBe(
      "claude-acp",
    )
    expect(SessionSchema.parse({ ...validSession, agentId: "opencode" }).agentId).toBe("opencode")
  })

  test("accepts open agent ids including registry-ahead", () => {
    expect(SessionSchema.parse({ ...validSession, agentId: "not-a-catalog-agent" }).agentId).toBe(
      "not-a-catalog-agent",
    )
  })

  test("rejects empty agent id", () => {
    expect(() => SessionSchema.parse({ ...validSession, agentId: "" })).toThrow()
  })

  test("rejects internal acpSessionId", () => {
    expect(() =>
      SessionSchema.parse({
        ...validSession,
        acpSessionId: "acp-session-1",
      }),
    ).toThrow()
  })
})

describe("CreateSessionBodySchema", () => {
  test("accepts agentId and cwd", () => {
    const body = {
      agentId: "cursor",
      cwd: "/tmp/project",
    }

    expect(CreateSessionBodySchema.parse(body)).toEqual(body)
  })

  test("accepts open agent ids", () => {
    expect(
      CreateSessionBodySchema.parse({
        agentId: "not-a-catalog-agent",
        cwd: "/tmp/project",
      }).agentId,
    ).toBe("not-a-catalog-agent")
  })

  test("rejects empty agent id", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        agentId: "",
        cwd: "/tmp/project",
      }),
    ).toThrow()
  })

  test("rejects empty cwd", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        agentId: "cursor",
        cwd: "",
      }),
    ).toThrow()
  })

  test("rejects workspaceId and first-prompt text", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        agentId: "cursor",
        cwd: "/tmp/project",
        workspaceId: "ws-harold",
        text: "Explain the auth flow",
      }),
    ).toThrow()
  })
})

describe("CreateSessionResponseSchema", () => {
  const catalogSession = {
    agentId: "cursor",
    sessionId: "acp-session-1",
    cwd: "/tmp/project",
    title: "acp-session-1",
    updatedAt: "2026-08-11T12:00:00.000Z",
  } as const

  const modelOption = {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "grok-4.5",
    options: [
      { value: "grok-4.5", name: "Cursor Grok 4.5" },
      { value: "default", name: "Auto" },
    ],
  } as const

  test("accepts configOptions from the ACP session/new response", () => {
    const response = {
      ...catalogSession,
      configOptions: [
        modelOption,
        {
          id: "model_config",
          name: "Model config",
          category: "model_config",
          type: "boolean",
          currentValue: false,
        },
      ],
    }

    expect(CreateSessionResponseSchema.parse(response)).toEqual(response)
  })

  test("accepts an empty configOptions list", () => {
    expect(CreateSessionResponseSchema.parse({ ...catalogSession, configOptions: [] })).toEqual({
      ...catalogSession,
      configOptions: [],
    })
  })

  test("rejects a create response without configOptions", () => {
    expect(() => CreateSessionResponseSchema.parse(catalogSession)).toThrow()
  })

  test("rejects malformed configOptions", () => {
    expect(() =>
      CreateSessionResponseSchema.parse({
        ...catalogSession,
        configOptions: [{ type: "slider" }],
      }),
    ).toThrow()
  })

  test("rejects legacy turnId create response", () => {
    expect(() =>
      CreateSessionResponseSchema.parse({
        ...validSession,
        turnId: validTurnId,
      }),
    ).toThrow()
  })
})

describe("UpdateSessionBodySchema", () => {
  test("accepts a valid update body", () => {
    const body = { name: "Renamed session" }

    expect(UpdateSessionBodySchema.parse(body)).toEqual(body)
  })

  test("rejects empty name", () => {
    expect(() => UpdateSessionBodySchema.parse({ name: "" })).toThrow()
  })

  test("rejects name over 120 characters", () => {
    expect(() => UpdateSessionBodySchema.parse({ name: "a".repeat(121) })).toThrow()
  })

  test("rejects workspaceId on update", () => {
    expect(() =>
      UpdateSessionBodySchema.parse({
        name: "Renamed session",
        workspaceId: "ws-harold",
      }),
    ).toThrow()
  })

  test("rejects internal acpSessionId", () => {
    expect(() =>
      UpdateSessionBodySchema.parse({
        name: "Renamed session",
        acpSessionId: "acp-session-1",
      }),
    ).toThrow()
  })
})

describe("ListSessionsQuerySchema", () => {
  test("accepts empty query", () => {
    expect(ListSessionsQuerySchema.parse({})).toEqual({})
  })

  test("accepts optional cwd", () => {
    expect(ListSessionsQuerySchema.parse({ cwd: "/tmp/project" })).toEqual({
      cwd: "/tmp/project",
    })
  })

  test("rejects empty cwd", () => {
    expect(() => ListSessionsQuerySchema.parse({ cwd: "" })).toThrow()
  })

  test("rejects legacy workspaceId pagination fields", () => {
    expect(() =>
      ListSessionsQuerySchema.parse({
        workspaceId: "ws-harold",
        limit: 100,
        cursor: "session_02",
        search: "auth",
      }),
    ).toThrow()
  })
})

describe("SessionCollectionSchema", () => {
  const catalogSession = {
    agentId: "cursor",
    sessionId: "acp-session-1",
    cwd: "/tmp/project",
    title: "Auth flow",
    updatedAt: "2026-08-11T12:00:00.000Z",
  } as const

  test("accepts an ACP catalog collection", () => {
    const collection = {
      items: [catalogSession],
    }

    expect(SessionCollectionSchema.parse(collection)).toEqual(collection)
  })

  test("rejects legacy page metadata", () => {
    expect(() =>
      SessionCollectionSchema.parse({
        items: [catalogSession],
        page: { limit: 20, nextCursor: "session_02", count: 1 },
      }),
    ).toThrow()
  })
})

describe("deleteSessionPath", () => {
  test("encodes sessionId and agentId on DELETE /v1/sessions/{sessionId}", () => {
    expect(sessionPath("acp-1")).toBe("/v1/sessions/acp-1")
    expect(deleteSessionPath("acp:1/two", { agentId: "cursor" })).toBe(
      "/v1/sessions/acp%3A1%2Ftwo?agentId=cursor",
    )
  })
})

describe("DeleteSessionQuerySchema", () => {
  test("accepts agentId", () => {
    expect(DeleteSessionQuerySchema.parse({ agentId: "cursor" })).toEqual({
      agentId: "cursor",
    })
  })

  test("rejects missing agentId", () => {
    expect(() => DeleteSessionQuerySchema.parse({})).toThrow()
  })

  test("rejects empty agentId", () => {
    expect(() => DeleteSessionQuerySchema.parse({ agentId: "" })).toThrow()
  })
})

describe("DeleteSessionParamsSchema", () => {
  test("accepts a non-empty sessionId", () => {
    expect(DeleteSessionParamsSchema.parse({ sessionId: "acp-1" })).toEqual({
      sessionId: "acp-1",
    })
  })

  test("rejects empty sessionId", () => {
    expect(() => DeleteSessionParamsSchema.parse({ sessionId: "" })).toThrow()
  })

  test("rejects extra keys", () => {
    expect(() =>
      DeleteSessionParamsSchema.parse({ sessionId: "acp-1", agentId: "cursor" }),
    ).toThrow()
  })
})

describe("PromptSessionBodySchema", () => {
  test("accepts non-empty text", () => {
    const body = { text: "Fix the login bug" }

    expect(PromptSessionBodySchema.parse(body)).toEqual(body)
  })

  test("accepts text at max length 32768", () => {
    const body = { text: "a".repeat(32_768) }

    expect(PromptSessionBodySchema.parse(body)).toEqual(body)
  })

  test("rejects empty text", () => {
    expect(() => PromptSessionBodySchema.parse({ text: "" })).toThrow()
  })

  test("rejects text over 32768 characters", () => {
    expect(() => PromptSessionBodySchema.parse({ text: "a".repeat(32_769) })).toThrow()
  })

  test("rejects missing text", () => {
    expect(() => PromptSessionBodySchema.parse({})).toThrow()
  })

  test("rejects extra fields", () => {
    expect(() =>
      PromptSessionBodySchema.parse({
        text: "Fix the login bug",
        commandId: "cmd-1",
      }),
    ).toThrow()
  })
})

describe("PromptSessionResponseSchema", () => {
  test("accepts turnId", () => {
    const response = { turnId: validTurnId }

    expect(PromptSessionResponseSchema.parse(response)).toEqual(response)
  })

  test("rejects missing turnId", () => {
    expect(() => PromptSessionResponseSchema.parse({})).toThrow()
  })

  test("rejects invalid turnId", () => {
    expect(() => PromptSessionResponseSchema.parse({ turnId: "not-a-turn-id" })).toThrow()
  })

  test("rejects extra fields", () => {
    expect(() =>
      PromptSessionResponseSchema.parse({
        turnId: validTurnId,
        status: "accepted",
      }),
    ).toThrow()
  })
})

describe("CancelSessionBodySchema", () => {
  test("accepts empty body", () => {
    expect(CancelSessionBodySchema.parse({})).toEqual({})
  })

  test("rejects extra fields", () => {
    expect(() => CancelSessionBodySchema.parse({ turnId: validTurnId })).toThrow()
  })
})

describe("CancelSessionResponseSchema", () => {
  test("accepts turnId", () => {
    const response = { turnId: validTurnId }

    expect(CancelSessionResponseSchema.parse(response)).toEqual(response)
  })

  test("rejects missing turnId", () => {
    expect(() => CancelSessionResponseSchema.parse({})).toThrow()
  })

  test("rejects invalid turnId", () => {
    expect(() => CancelSessionResponseSchema.parse({ turnId: "not-a-turn-id" })).toThrow()
  })

  test("rejects extra fields", () => {
    expect(() =>
      CancelSessionResponseSchema.parse({
        turnId: validTurnId,
        status: "cancelled",
      }),
    ).toThrow()
  })
})
