import { describe, expect, test } from "bun:test"
import {
  CreateSessionBodySchema,
  ListSessionsQuerySchema,
  SessionCollectionSchema,
  SessionSchema,
  UpdateSessionBodySchema,
} from "./session"

const validSession = {
  id: "session-auth",
  workspaceId: "ws-agent-server",
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

  test("rejects prototype agent vocabulary", () => {
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
  test("accepts a valid create body", () => {
    const body = { workspaceId: "ws-agent-server", name: "Auth flow" }

    expect(CreateSessionBodySchema.parse(body)).toEqual(body)
  })

  test("rejects empty name", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        workspaceId: "ws-agent-server",
        name: "",
      }),
    ).toThrow()
  })

  test("rejects name over 120 characters", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        workspaceId: "ws-agent-server",
        name: "a".repeat(121),
      }),
    ).toThrow()
  })

  test("rejects internal acpSessionId", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        workspaceId: "ws-agent-server",
        name: "Auth flow",
        acpSessionId: "acp-session-1",
      }),
    ).toThrow()
  })

  test("rejects prototype state field", () => {
    expect(() =>
      CreateSessionBodySchema.parse({
        workspaceId: "ws-agent-server",
        name: "Auth flow",
        state: "idle",
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
