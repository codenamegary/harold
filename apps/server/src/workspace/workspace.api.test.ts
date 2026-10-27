import { describe, expect, test } from "bun:test"
import { mkdir, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  NotFoundProblemSchema,
  UnprocessableProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { WorkspaceCollectionSchema, WorkspaceSchema } from "contracts/http/workspace"
import { bootTestApp } from "../test-support/test.harness"
import { encodeWorkspacePageCursor } from "core/workspace/page.cursor"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

type TestServerApp = Awaited<ReturnType<typeof bootTestApp>>["app"]

const createWorkspaceDir = async (parent: string, name: string) => {
  const dir = path.join(parent, name)
  await mkdir(dir)
  return dir
}

const registerWorkspace = async (app: TestServerApp, payload: { name?: string; path: string }) =>
  app.inject({
    headers: authHeaders(app),
    method: "POST",
    url: "/v1/workspaces",
    payload: { source: "folder", ...payload },
  })

const gitWorkspace = async (
  app: TestServerApp,
  payload: { url: string; path: string; name?: string },
) =>
  app.inject({
    headers: authHeaders(app),
    method: "POST",
    url: "/v1/workspaces",
    payload: { source: "git", ...payload },
  })

const createSourceRepo = async (parent: string, name: string) => {
  const repo = path.join(parent, name)
  await mkdir(repo)
  await writeFile(path.join(repo, "README.md"), "# widgets\n")
  await Bun.$`git -C ${repo} init --quiet`.quiet()
  await Bun.$`git -C ${repo} add .`.quiet()
  await Bun.$`git -C ${repo} -c user.email=test@harold.local -c user.name=Harold commit --quiet -m init`.quiet()
  return repo
}

describe("POST /v1/workspaces", () => {
  test("returns 201 with WorkspaceSchema", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")

    const response = await registerWorkspace(app, {
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

  test("defaults the name to the folder basename", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "widgets")

    const response = await registerWorkspace(app, { path: workspaceDir })

    const body = WorkspaceSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(201)
    expect(body.name).toBe("widgets")
  })

  test("opens any existing folder outside the data directory", async () => {
    const { app } = await bootTestApp()
    const root = await Bun.$`mktemp -d`.text()
    const outside = path.join(root.trim(), "outside")
    await mkdir(outside)

    const response = await registerWorkspace(app, { path: outside })

    expect(response.statusCode).toBe(201)
    await rm(root.trim(), { recursive: true, force: true })
  })

  test("returns 200, keeps the existing name, and bumps lastUsedAt when the path is already registered", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")

    const first = await registerWorkspace(app, { name: "Original", path: workspaceDir })
    const before = WorkspaceSchema.parse(JSON.parse(first.body))

    await new Promise((resolve) => setTimeout(resolve, 5))

    const second = await registerWorkspace(app, { name: "Replacement", path: workspaceDir })
    const after = WorkspaceSchema.parse(JSON.parse(second.body))

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(200)
    expect(after.id).toBe(before.id)
    expect(after.name).toBe("Original")
    expect(after.lastUsedAt > before.lastUsedAt).toBe(true)
  })

  test("find-or-create follows symlinks to the canonical path", async () => {
    const { app, dataDir } = await bootTestApp()
    const target = await createWorkspaceDir(dataDir, "target")
    const link = path.join(dataDir, "link")
    await symlink(target, link)

    const first = await registerWorkspace(app, { name: "First", path: target })
    const second = await registerWorkspace(app, { name: "Second", path: link })

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(200)
    expect(JSON.parse(second.body).id).toBe(JSON.parse(first.body).id)
  })

  test("returns 400 for missing path", async () => {
    const { app, dataDir } = await bootTestApp()
    const missingPath = path.join(dataDir, "missing")

    const response = await registerWorkspace(app, { name: "Missing", path: missingPath })

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
    await writeFile(filePath, "not a directory")

    const response = await registerWorkspace(app, { name: "File", path: filePath })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/path")
    expect(body.errors[0]?.code).toBe("validation.field.path.not_directory")
  })
})

describe("POST /v1/workspaces git source", () => {
  test("clones a local repository into an empty destination and registers it", async () => {
    const { app, dataDir } = await bootTestApp()
    const source = await createSourceRepo(dataDir, "source-repo")
    const destination = await createWorkspaceDir(dataDir, "widgets")

    const response = await gitWorkspace(app, {
      url: `file://${source}`,
      path: destination,
    })

    const body = WorkspaceSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(201)
    expect(body.path).toBe(path.resolve(destination))
    expect(body.name).toBe("widgets")
    expect(await Bun.file(path.join(destination, "README.md")).text()).toBe("# widgets\n")
  })

  test("returns 409 when the destination is not empty", async () => {
    const { app, dataDir } = await bootTestApp()
    const source = await createSourceRepo(dataDir, "source-repo")
    const destination = await createWorkspaceDir(dataDir, "widgets")
    await writeFile(path.join(destination, "existing.txt"), "keep me")

    const response = await gitWorkspace(app, {
      url: `file://${source}`,
      path: destination,
    })
    const body = JSON.parse(response.body) as { title: string; detail?: string }

    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("Workspace destination is not empty")
    expect(await Bun.file(path.join(destination, "existing.txt")).text()).toBe("keep me")
  })

  test("returns 422 with the destination when the clone fails", async () => {
    const { app, dataDir } = await bootTestApp()
    const destination = await createWorkspaceDir(dataDir, "widgets")
    const missingSource = path.join(dataDir, "no-such-repo")

    const response = await gitWorkspace(app, {
      url: `file://${missingSource}`,
      path: destination,
    })
    const body = UnprocessableProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(422)
    expect(body.detail).toContain(destination)
    expect((await readdirOrEmpty(destination)).length).toBe(0)
  })

  test("rejects a url that starts with a dash", async () => {
    const { app, dataDir } = await bootTestApp()
    const destination = await createWorkspaceDir(dataDir, "widgets")

    const response = await gitWorkspace(app, {
      url: "--upload-pack=evil",
      path: destination,
    })
    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/url")
    expect(body.errors[0]?.code).toBe("validation.field.url.invalid")
  })
})

const readdirOrEmpty = async (dir: string): Promise<string[]> => {
  try {
    return await Bun.$`ls -A ${dir}`
      .text()
      .then((output) => output.split("\n").filter((line) => line.length > 0))
  } catch {
    return []
  }
}

describe("GET /v1/workspaces", () => {
  test("returns WorkspaceCollectionSchema with limit and count", async () => {
    const { app, dataDir } = await bootTestApp()
    const alpha = await createWorkspaceDir(dataDir, "alpha")
    const beta = await createWorkspaceDir(dataDir, "beta")

    await registerWorkspace(app, { name: "Alpha", path: alpha })
    await registerWorkspace(app, { name: "Beta", path: beta })

    const response = await app.inject({
      headers: authHeaders(app),
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
      await registerWorkspace(app, {
        name: `Workspace ${index + 1}`,
        path: dir,
      })
    }

    const firstPage = WorkspaceCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            headers: authHeaders(app),
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
            headers: authHeaders(app),
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
            headers: authHeaders(app),
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
      headers: authHeaders(app),
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

    await registerWorkspace(app, { name: "Alpha Project", path: alpha })
    await registerWorkspace(app, { name: "Beta Other", path: beta })
    await rm(beta, { recursive: true, force: true })

    const searchResponse = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/workspaces?q=alpha",
    })
    const searchBody = WorkspaceCollectionSchema.parse(JSON.parse(searchResponse.body))

    expect(searchResponse.statusCode).toBe(200)
    expect(searchBody.items.map((workspace) => workspace.name)).toEqual(["Alpha Project"])
    expect(searchBody.page.count).toBe(1)

    const stateResponse = await app.inject({
      headers: authHeaders(app),
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

    const created = await registerWorkspace(app, { name: "Live", path: workspaceDir })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    const response = await app.inject({
      headers: authHeaders(app),
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
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/workspaces/ws_01J0000000000000000000000",
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Workspace not found")
  })
})

describe("PATCH /v1/workspaces/:workspaceId", () => {
  test("renames the workspace without bumping lastUsedAt", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "rename")

    const created = await registerWorkspace(app, { name: "Original", path: workspaceDir })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: `/v1/workspaces/${workspace.id}`,
      payload: { name: "Renamed" },
    })

    const body = WorkspaceSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.name).toBe("Renamed")
    expect(body.lastUsedAt).toBe(workspace.lastUsedAt)
  })

  test("does not reorder the list", async () => {
    const { app, dataDir } = await bootTestApp()
    const first = await createWorkspaceDir(dataDir, "first")
    const second = await createWorkspaceDir(dataDir, "second")

    const createdFirst = await registerWorkspace(app, { name: "First", path: first })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await registerWorkspace(app, { name: "Second", path: second })
    const firstWorkspace = WorkspaceSchema.parse(JSON.parse(createdFirst.body))

    await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: `/v1/workspaces/${firstWorkspace.id}`,
      payload: { name: "First Renamed" },
    })

    const listResponse = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/workspaces",
    })
    const list = WorkspaceCollectionSchema.parse(JSON.parse(listResponse.body))

    expect(list.items.map((workspace) => workspace.name)).toEqual(["Second", "First Renamed"])
  })

  test("returns 404 for unknown id", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
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

    const created = await registerWorkspace(app, { name: "Delete Me", path: workspaceDir })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    const response = await app.inject({
      headers: authHeaders(app),
      method: "DELETE",
      url: `/v1/workspaces/${workspace.id}`,
    })

    expect(response.statusCode).toBe(204)

    const listResponse = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/workspaces",
    })
    const list = WorkspaceCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(list.items).toEqual([])

    const { access } = await import("node:fs/promises")
    await access(workspaceDir)
  })

  test("returns 404 for unknown id", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
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

    const created = await registerWorkspace(app, { name: "Ephemeral", path: workspaceDir })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    await rm(workspaceDir, { recursive: true, force: true })

    const response = await app.inject({
      headers: authHeaders(app),
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

    const created = await registerWorkspace(first.app, { name: "Durable", path: workspaceDir })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    const second = await first.reopen()

    const listResponse = await second.app.inject({
      headers: authHeaders(second.app),
      method: "GET",
      url: "/v1/workspaces",
    })
    const list = WorkspaceCollectionSchema.parse(JSON.parse(listResponse.body))

    expect(list.items.length).toBe(1)
    expect(list.items[0]?.id).toBe(workspace.id)
    expect(list.items[0]?.name).toBe("Durable")
  })
})
