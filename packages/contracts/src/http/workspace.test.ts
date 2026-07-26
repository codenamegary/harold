import { describe, expect, test } from "bun:test"
import {
  CreateWorkspaceBodySchema,
  ListWorkspacesQuerySchema,
  UpdateWorkspaceBodySchema,
  WorkspaceCollectionSchema,
  WorkspaceSchema,
} from "./workspace"

const validWorkspace = {
  id: "ws-agent-server",
  name: "agent-server",
  path: "/home/operator/agent-server",
  state: "available",
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:05:00.000Z",
} as const

describe("WorkspaceSchema", () => {
  test("accepts a valid workspace", () => {
    expect(WorkspaceSchema.parse(validWorkspace)).toEqual(validWorkspace)
  })

  test("rejects prototype agent count fields", () => {
    expect(() =>
      WorkspaceSchema.parse({ ...validWorkspace, agentCount: 1 }),
    ).toThrow()
  })

  test("rejects prototype additionalDirectories", () => {
    expect(() =>
      WorkspaceSchema.parse({
        ...validWorkspace,
        additionalDirectories: ["/tmp"],
      }),
    ).toThrow()
  })
})

describe("CreateWorkspaceBodySchema", () => {
  test("accepts a valid create body", () => {
    const body = { name: "agent-server", path: "/home/operator/agent-server" }

    expect(CreateWorkspaceBodySchema.parse(body)).toEqual(body)
  })

  test("rejects empty name", () => {
    expect(() =>
      CreateWorkspaceBodySchema.parse({
        name: "",
        path: "/home/operator/agent-server",
      }),
    ).toThrow()
  })

  test("rejects name over 80 characters", () => {
    expect(() =>
      CreateWorkspaceBodySchema.parse({
        name: "a".repeat(81),
        path: "/home/operator/agent-server",
      }),
    ).toThrow()
  })

  test("rejects prototype state field", () => {
    expect(() =>
      CreateWorkspaceBodySchema.parse({
        name: "agent-server",
        path: "/home/operator/agent-server",
        state: "available",
      }),
    ).toThrow()
  })
})

describe("UpdateWorkspaceBodySchema", () => {
  test("accepts a valid update body", () => {
    const body = { name: "renamed" }

    expect(UpdateWorkspaceBodySchema.parse(body)).toEqual(body)
  })

  test("rejects path on update", () => {
    expect(() =>
      UpdateWorkspaceBodySchema.parse({
        name: "renamed",
        path: "/home/operator/agent-server",
      }),
    ).toThrow()
  })
})

describe("ListWorkspacesQuerySchema", () => {
  test("defaults limit to 100", () => {
    expect(ListWorkspacesQuerySchema.parse({})).toEqual({
      limit: 100,
    })
  })

  test("rejects limit above 200", () => {
    expect(() => ListWorkspacesQuerySchema.parse({ limit: 201 })).toThrow()
  })

  test("accepts search and state filters", () => {
    expect(
      ListWorkspacesQuerySchema.parse({ q: "agent", state: "available" }),
    ).toEqual({
      limit: 100,
      q: "agent",
      state: "available",
    })
  })
})

describe("WorkspaceCollectionSchema", () => {
  test("accepts a workspace collection", () => {
    const collection = {
      items: [validWorkspace],
      page: { limit: 20, nextCursor: "ws_02", count: 1 },
    }

    expect(WorkspaceCollectionSchema.parse(collection)).toEqual(collection)
  })

  test("rejects prototype hasMore on page", () => {
    expect(() =>
      WorkspaceCollectionSchema.parse({
        items: [validWorkspace],
        page: { limit: 20, hasMore: true },
      }),
    ).toThrow()
  })
})
