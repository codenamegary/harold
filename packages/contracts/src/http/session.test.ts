import { describe, expect, test } from "bun:test"
import {
  CancelSessionBodySchema,
  CancelSessionResponseSchema,
  CreateSessionBodySchema,
  CreateSessionResponseSchema,
  ListSessionsQuerySchema,
  PromptSessionBodySchema,
  PromptSessionResponseSchema,
  SessionCollectionSchema,
  SessionSchema,
  UpdateSessionBodySchema,
} from "./session"

const validTurnId = "turn_01JFC8C7E77NQCFH0RF9Z22JHH"

const validSession = {
  id: "session-auth",
  workspaceId: "ws-agent-server",
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

  test("accepts cursor and claude agent ids", () => {
    expect(SessionSchema.parse({ ...validSession, agentId: "cursor" }).agentId).toBe("cursor")
    expect(SessionSchema.parse({ ...validSession, agentId: "claude" }).agentId).toBe("claude")
  })

  test("rejects invalid agent id", () => {
    expect(() =>
      SessionSchema.parse({ ...validSession, agentId: "agent-auth" }),
    ).toThrow()
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
  test("accepts a valid create body with prompt text", () => {
    const body = {
      workspaceId: "ws-agent-server",
      agentId: "cursor",
      text: "Explain the auth flow",
    }

    expect(CreateSessionBodySchema.parse(body)).toEqual(body)
  })

  test("rejects invalid agent id", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        workspaceId: "ws-agent-server",
        agentId: "agent-auth",
        text: "Explain the auth flow",
      }),
    ).toThrow()
  })

  test("rejects empty text", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        workspaceId: "ws-agent-server",
        agentId: "cursor",
        text: "",
      }),
    ).toThrow()
  })

  test("rejects text over 32768 characters", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        workspaceId: "ws-agent-server",
        agentId: "cursor",
        text: "a".repeat(32_769),
      }),
    ).toThrow()
  })

  test("rejects client name field", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        workspaceId: "ws-agent-server",
        agentId: "cursor",
        text: "Explain the auth flow",
        name: "Auth flow",
      }),
    ).toThrow()
  })

  test("rejects internal acpSessionId", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        workspaceId: "ws-agent-server",
        agentId: "cursor",
        text: "Explain the auth flow",
        acpSessionId: "acp-session-1",
      }),
    ).toThrow()
  })

  test("rejects prototype state field", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        workspaceId: "ws-agent-server",
        agentId: "cursor",
        text: "Explain the auth flow",
        state: "idle",
      }),
    ).toThrow()
  })
})

describe("CreateSessionResponseSchema", () => {
  test("accepts session fields plus turnId", () => {
    const body = {
      ...validSession,
      turnId: validTurnId,
    }

    expect(CreateSessionResponseSchema.parse(body)).toEqual(body)
  })

  test("rejects response without turnId", () => {
    expect(() => CreateSessionResponseSchema.parse(validSession)).toThrow()
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
    expect(() =>
      UpdateSessionBodySchema.parse({ name: "a".repeat(121) }),
    ).toThrow()
  })

  test("rejects workspaceId on update", () => {
    expect(() =>
      UpdateSessionBodySchema.parse({
        name: "Renamed session",
        workspaceId: "ws-agent-server",
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
  test("defaults limit to 100", () => {
    expect(
      ListSessionsQuerySchema.parse({ workspaceId: "ws-agent-server" }),
    ).toEqual({
      workspaceId: "ws-agent-server",
      limit: 100,
    })
  })

  test("rejects limit above 200", () => {
    expect(() =>
      ListSessionsQuerySchema.parse({
        workspaceId: "ws-agent-server",
        limit: 201,
      }),
    ).toThrow()
  })

  test("requires workspaceId", () => {
    expect(() => ListSessionsQuerySchema.parse({})).toThrow()
  })

  test("accepts cursor", () => {
    expect(
      ListSessionsQuerySchema.parse({
        workspaceId: "ws-agent-server",
        cursor: "session_02",
      }),
    ).toEqual({
      workspaceId: "ws-agent-server",
      limit: 100,
      cursor: "session_02",
    })
  })
})

describe("SessionCollectionSchema", () => {
  test("accepts a session collection", () => {
    const collection = {
      items: [validSession],
      page: { limit: 20, nextCursor: "session_02", count: 1 },
    }

    expect(SessionCollectionSchema.parse(collection)).toEqual(collection)
  })

  test("rejects prototype hasMore on page", () => {
    expect(() =>
      SessionCollectionSchema.parse({
        items: [validSession],
        page: { limit: 20, hasMore: true },
      }),
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
    expect(() =>
      PromptSessionBodySchema.parse({ text: "a".repeat(32_769) }),
    ).toThrow()
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
    expect(() =>
      PromptSessionResponseSchema.parse({ turnId: "not-a-turn-id" }),
    ).toThrow()
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
    expect(() =>
      CancelSessionBodySchema.parse({ turnId: validTurnId }),
    ).toThrow()
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
    expect(() =>
      CancelSessionResponseSchema.parse({ turnId: "not-a-turn-id" }),
    ).toThrow()
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
