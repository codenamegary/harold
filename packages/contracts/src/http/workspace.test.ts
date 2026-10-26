import { describe, expect, test } from "bun:test"
import {
  CreateWorkspaceBodySchema,
  ListWorkspacesQuerySchema,
  UpdateWorkspaceBodySchema,
  WorkspaceCollectionSchema,
  WorkspaceSchema,
} from "./workspace"

const validWorkspace = {
  id: "ws-harold",
  name: "harold",
  path: "/home/user/harold",
  state: "available",
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:05:00.000Z",
} as const

describe("WorkspaceSchema", () => {
  test("accepts a valid workspace", () => {
    expect(WorkspaceSchema.parse(validWorkspace)).toEqual(validWorkspace)
  })

  test("rejects prototype agent count fields", () => {
    expect(() => WorkspaceSchema.parse({ ...validWorkspace, agentCount: 1 })).toThrow()
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
  test("accepts a folder source with a name", () => {
    const body = {
      source: "folder",
      name: "harold",
      path: "/home/user/harold",
    }

    expect(CreateWorkspaceBodySchema.parse(body)).toEqual(body)
  })

  test("accepts a folder source without a name", () => {
    const body = { source: "folder", path: "/home/user/harold" }

    expect(CreateWorkspaceBodySchema.parse(body)).toEqual(body)
  })

  test("accepts a git source", () => {
    const body = {
      source: "git",
      url: "https://github.com/acme/widgets.git",
      path: "/home/user/widgets",
      name: "Widgets",
    }

    expect(CreateWorkspaceBodySchema.parse(body)).toEqual(body)
  })

  test("gives a git source a name derived from its destination", () => {
    const body = {
      source: "git",
      url: "git@github.com:acme/widgets.git",
      path: "/home/user/widgets",
    }

    expect(CreateWorkspaceBodySchema.parse(body)).toEqual(body)
  })

  test("rejects a body without a source", () => {
    expect(() =>
      CreateWorkspaceBodySchema.parse({
        name: "harold",
        path: "/home/user/harold",
      }),
    ).toThrow()
  })

  test("rejects an unknown source", () => {
    expect(() =>
      CreateWorkspaceBodySchema.parse({
        source: "tar",
        path: "/home/user/harold",
      }),
    ).toThrow()
  })

  test("rejects a git source without a url", () => {
    expect(() =>
      CreateWorkspaceBodySchema.parse({
        source: "git",
        path: "/home/user/widgets",
      }),
    ).toThrow()
  })

  test("rejects a url on a folder source", () => {
    expect(() =>
      CreateWorkspaceBodySchema.parse({
        source: "folder",
        path: "/home/user/harold",
        url: "https://github.com/acme/widgets.git",
      }),
    ).toThrow()
  })

  test("rejects an empty name", () => {
    expect(() =>
      CreateWorkspaceBodySchema.parse({
        source: "folder",
        name: "",
        path: "/home/user/harold",
      }),
    ).toThrow()
  })

  test("rejects name over 80 characters", () => {
    expect(() =>
      CreateWorkspaceBodySchema.parse({
        source: "folder",
        name: "a".repeat(81),
        path: "/home/user/harold",
      }),
    ).toThrow()
  })

  test("rejects prototype state field", () => {
    expect(() =>
      CreateWorkspaceBodySchema.parse({
        source: "folder",
        path: "/home/user/harold",
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
        path: "/home/user/harold",
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
    expect(ListWorkspacesQuerySchema.parse({ q: "agent", state: "available" })).toEqual({
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
