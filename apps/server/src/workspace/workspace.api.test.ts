import { describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { WorkspaceCollectionSchema, WorkspaceSchema } from "contracts/http/workspace"
import { bootTestApp } from "../test-support/test.harness"
import { encodeWorkspacePageCursor } from "core/workspace/page.cursor"

type TestServerApp = Awaited<ReturnType<typeof bootTestApp>>["app"]

const createWorkspaceDir = async (parent: string, name: string) => {
  const dir = path.join(parent, name)
  await mkdir(dir)
  return dir
}

const allowRoots = async (app: TestServerApp, roots: string[]) => {
  await app.inject({
    method: "PATCH",
    url: "/v1/settings/runtime",
    payload: { allowedRoots: roots },
  })
}

const registerWorkspace = async (
  app: TestServerApp,
  dataDir: string,
  payload: { name: string; path: string },
) => {
  await allowRoots(app, [dataDir])
  return app.inject({
    method: "POST",
    url: "/v1/workspaces",
    payload,
  })
}

describe("POST /v1/workspaces", () => {
  test("returns 201 with WorkspaceSchema", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")

    const response = await registerWorkspace(app, dataDir, {
      name: "My Project",
      path: workspaceDir,
    })

    const body = WorkspaceSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(201)
    expect(body.name).toBe("My Project")
    expect(body.path).toBe(path.resolve(workspaceDir))
    expect(body.state).toBe("available")
    expect(body.id).toMatch(/^ws_[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  test("returns 400 for missing path", async () => {
    const { app, dataDir } = await bootTestApp()
    const missingPath = path.join(dataDir, "missing")

    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Missing", path: missingPath },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.errors[0]?.pointer).toBe("#/path")
    expect(body.errors[0]?.code).toBe("validation.field.path.missing")
  })

  test("returns 400 for non-directory path", async () => {
    const { app, dataDir } = await bootTestApp()
    const filePath = path.join(dataDir, "file.txt")
    await mkdir(dataDir, { recursive: true })
    const { writeFile } = await import("node:fs/promises")
    await writeFile(filePath, "not a directory")

    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "File", path: filePath },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/path")
    expect(body.errors[0]?.code).toBe("validation.field.path.not_directory")
  })

  test("returns 409 for duplicate canonical path", async () => {
    const { app, dataDir } = await bootTestApp()
    const target = await createWorkspaceDir(dataDir, "target")
    const { symlink } = await import("node:fs/promises")
    const link = path.join(dataDir, "link")
    await symlink(target, link)

    const first = await registerWorkspace(app, dataDir, { name: "First", path: target })
    const second = await registerWorkspace(app, dataDir, { name: "Second", path: link })

    const body = ConflictProblemSchema.parse(JSON.parse(second.body))

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(409)
    expect(body.title).toBe("Workspace path already registered")
  })
})

describe("GET /v1/workspaces", () => {
  test("returns WorkspaceCollectionSchema with limit and count", async () => {
    const { app, dataDir } = await bootTestApp()
    const alpha = await createWorkspaceDir(dataDir, "alpha")
    const beta = await createWorkspaceDir(dataDir, "beta")

    await registerWorkspace(app, dataDir, { name: "Alpha", path: alpha })
    await registerWorkspace(app, dataDir, { name: "Beta", path: beta })

    const response = await app.inject({
      method: "GET",
      url: "/v1/workspaces?limit=1",
    })

    const body = WorkspaceCollectionSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.items.length).toBe(1)
    expect(body.page.limit).toBe(1)
    expect(body.page.count).toBe(2)
    expect(body.page.nextCursor).toBeDefined()
  })

  test("pages forward and backward with opaque cursors", async () => {
    const { app, dataDir } = await bootTestApp()
    const dirs = await Promise.all([
      createWorkspaceDir(dataDir, "one"),
      createWorkspaceDir(dataDir, "two"),
      createWorkspaceDir(dataDir, "three"),
    ])

    for (const [index, dir] of dirs.entries()) {
      await registerWorkspace(app, dataDir, {
        name: `Workspace ${index + 1}`,
        path: dir,
      })
    }

    const firstPage = WorkspaceCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: "/v1/workspaces?limit=2",
          })
        ).body,
      ),
    )

    expect(firstPage.items.length).toBe(2)
    expect(firstPage.page.nextCursor).toBeDefined()
    expect(firstPage.page.previousCursor).toBeUndefined()

    const secondPage = WorkspaceCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: `/v1/workspaces?limit=2&cursor=${firstPage.page.nextCursor}`,
          })
        ).body,
      ),
    )

    expect(secondPage.items.length).toBe(1)
    expect(secondPage.page.nextCursor).toBeUndefined()
    expect(secondPage.page.previousCursor).toBeDefined()

    const backToFirst = WorkspaceCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: `/v1/workspaces?limit=2&cursor=${secondPage.page.previousCursor}`,
          })
        ).body,
      ),
    )

    expect(backToFirst.items.map((workspace) => workspace.id)).toEqual(
      firstPage.items.map((workspace) => workspace.id),
    )
  })

  test("returns 400 for invalid cursor", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces?cursor=${encodeWorkspacePageCursor({
        id: "ws_01J0000000000000000000000",
        edge: "after",
      })}`,
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/cursor")
    expect(body.errors[0]?.code).toBe("validation.query.cursor.invalid")
  })

  test("filters by search query and state", async () => {
    const { app, dataDir } = await bootTestApp()
    const alpha = await createWorkspaceDir(dataDir, "alpha-project")
    const beta = await createWorkspaceDir(dataDir, "beta-other")

    await registerWorkspace(app, dataDir, { name: "Alpha Project", path: alpha })
    await registerWorkspace(app, dataDir, { name: "Beta Other", path: beta })
    await rm(beta, { recursive: true, force: true })

    const searchResponse = await app.inject({
      method: "GET",
      url: "/v1/workspaces?q=alpha",
    })
    const searchBody = WorkspaceCollectionSchema.parse(JSON.parse(searchResponse.body))

    expect(searchResponse.statusCode).toBe(200)
    expect(searchBody.items.map((workspace) => workspace.name)).toEqual(["Alpha Project"])
    expect(searchBody.page.count).toBe(1)

    const stateResponse = await app.inject({
      method: "GET",
      url: "/v1/workspaces?state=missing",
    })
    const stateBody = WorkspaceCollectionSchema.parse(JSON.parse(stateResponse.body))

    expect(stateResponse.statusCode).toBe(200)
    expect(stateBody.items.map((workspace) => workspace.name)).toEqual(["Beta Other"])
    expect(stateBody.page.count).toBe(1)
  })
})

describe("GET /v1/workspaces/:workspaceId", () => {
  test("returns live workspace state", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "live")

    const created = await registerWorkspace(app, dataDir, {
      name: "Live",
      path: workspaceDir,
    })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspace.id}`,
    })

    const body = WorkspaceSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.id).toBe(workspace.id)
    expect(body.state).toBe("available")
  })

  test("returns 404 for unknown id", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      method: "GET",
      url: "/v1/workspaces/ws_01J0000000000000000000000",
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Workspace not found")
  })
})

describe("PATCH /v1/workspaces/:workspaceId", () => {
  test("renames workspace and updates lastUsedAt", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "rename")

    const created = await registerWorkspace(app, dataDir, {
      name: "Original",
      path: workspaceDir,
    })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspace.id}`,
      payload: { name: "Renamed" },
    })

    const body = WorkspaceSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.name).toBe("Renamed")
    expect(body.lastUsedAt >= workspace.lastUsedAt).toBe(true)
  })

  test("returns 404 for unknown id", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/workspaces/ws_01J0000000000000000000000",
      payload: { name: "Nope" },
    })

    expect(response.statusCode).toBe(404)
    NotFoundProblemSchema.parse(JSON.parse(response.body))
  })
})

describe("DELETE /v1/workspaces/:workspaceId", () => {
  test("returns 204 and removes metadata only", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "delete-me")

    const created = await registerWorkspace(app, dataDir, {
      name: "Delete Me",
      path: workspaceDir,
    })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspace.id}`,
    })

    expect(response.statusCode).toBe(204)

    const listResponse = await app.inject({ method: "GET", url: "/v1/workspaces" })
    const list = WorkspaceCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(list.items).toEqual([])

    const { access } = await import("node:fs/promises")
    await access(workspaceDir)
  })

  test("returns 404 for unknown id", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/workspaces/ws_01J0000000000000000000000",
    })

    expect(response.statusCode).toBe(404)
    NotFoundProblemSchema.parse(JSON.parse(response.body))
  })
})

describe("workspace state transitions", () => {
  test("reports missing state after directory removal", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "ephemeral")

    const created = await registerWorkspace(app, dataDir, {
      name: "Ephemeral",
      path: workspaceDir,
    })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    await rm(workspaceDir, { recursive: true, force: true })

    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspace.id}`,
    })

    const body = WorkspaceSchema.parse(JSON.parse(response.body))
    expect(body.state).toBe("missing")
  })
})

describe("restart durability", () => {
  test("keeps workspace metadata across server restart", async () => {
    const first = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(first.dataDir, "durable")

    const created = await registerWorkspace(first.app, first.dataDir, {
      name: "Durable",
      path: workspaceDir,
    })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    const second = await first.reopen()

    const listResponse = await second.app.inject({ method: "GET", url: "/v1/workspaces" })
    const list = WorkspaceCollectionSchema.parse(JSON.parse(listResponse.body))

    expect(list.items.length).toBe(1)
    expect(list.items[0]?.id).toBe(workspace.id)
    expect(list.items[0]?.name).toBe("Durable")
  })
})
