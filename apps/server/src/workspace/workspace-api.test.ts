import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import {
  WorkspaceCollectionSchema,
  WorkspaceSchema,
} from "contracts/http/workspace"
import { createServer } from "../bootstrap/create-server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/open-database"
import { createRuntime } from "../runtime/runtime"

const tempDirs: string[] = []
const apps: Awaited<ReturnType<typeof createServer>>[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-workspace-api-"))
  tempDirs.push(dir)
  return dir
}

const createWorkspaceDir = async (parent: string, name: string) => {
  const dir = path.join(parent, name)
  await mkdir(dir)
  return dir
}

const createTestApp = async (dataDir: string) => {
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "0",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const app = await createServer({ config, runtime, database })
  apps.push(app)
  return { app, database, config }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("POST /v1/workspaces", () => {
  test("returns 201 with WorkspaceSchema", async () => {
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "My Project", path: workspaceDir },
    })

    const body = WorkspaceSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(201)
    expect(body.name).toBe("My Project")
    expect(body.path).toBe(path.resolve(workspaceDir))
    expect(body.state).toBe("available")
    expect(body.id).toMatch(/^ws_[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  test("returns 400 for missing path", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)
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
    const dataDir = await createTempDataDir()
    const filePath = path.join(dataDir, "file.txt")
    await mkdir(dataDir, { recursive: true })
    const { writeFile } = await import("node:fs/promises")
    await writeFile(filePath, "not a directory")
    const { app } = await createTestApp(dataDir)

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
    const dataDir = await createTempDataDir()
    const target = await createWorkspaceDir(dataDir, "target")
    const { symlink } = await import("node:fs/promises")
    const link = path.join(dataDir, "link")
    await symlink(target, link)
    const { app } = await createTestApp(dataDir)

    const first = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "First", path: target },
    })
    const second = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Second", path: link },
    })

    const body = ConflictProblemSchema.parse(JSON.parse(second.body))

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(409)
    expect(body.title).toBe("Workspace path already registered")
  })
})

describe("GET /v1/workspaces", () => {
  test("returns WorkspaceCollectionSchema with limit and count", async () => {
    const dataDir = await createTempDataDir()
    const alpha = await createWorkspaceDir(dataDir, "alpha")
    const beta = await createWorkspaceDir(dataDir, "beta")
    const { app } = await createTestApp(dataDir)

    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Alpha", path: alpha },
    })
    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Beta", path: beta },
    })

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
    const dataDir = await createTempDataDir()
    const dirs = await Promise.all([
      createWorkspaceDir(dataDir, "one"),
      createWorkspaceDir(dataDir, "two"),
      createWorkspaceDir(dataDir, "three"),
    ])
    const { app } = await createTestApp(dataDir)

    for (const [index, dir] of dirs.entries()) {
      await app.inject({
        method: "POST",
        url: "/v1/workspaces",
        payload: { name: `Workspace ${index + 1}`, path: dir },
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
            url: `/v1/workspaces?limit=2&cursor=${secondPage.page.previousCursor}&direction=backward`,
          })
        ).body,
      ),
    )

    expect(backToFirst.items.map((workspace) => workspace.id)).toEqual(
      firstPage.items.map((workspace) => workspace.id),
    )
  })

  test("returns 400 for invalid cursor", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "GET",
      url: "/v1/workspaces?cursor=ws_01J0000000000000000000000",
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/cursor")
    expect(body.errors[0]?.code).toBe("validation.query.cursor.invalid")
  })
})

describe("GET /v1/workspaces/:workspaceId", () => {
  test("returns live workspace state", async () => {
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "live")
    const { app } = await createTestApp(dataDir)

    const created = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Live", path: workspaceDir },
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
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

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
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "rename")
    const { app } = await createTestApp(dataDir)

    const created = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Original", path: workspaceDir },
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
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

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
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "delete-me")
    const { app } = await createTestApp(dataDir)

    const created = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Delete Me", path: workspaceDir },
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
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

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
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "ephemeral")
    const { app } = await createTestApp(dataDir)

    const created = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Ephemeral", path: workspaceDir },
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
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "durable")

    const firstConfig = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const firstDatabase = openDatabase({ dataDir: firstConfig.dataDir })
    const firstRuntime = createRuntime("0.1.0")
    const firstApp = await createServer({
      config: firstConfig,
      runtime: firstRuntime,
      database: firstDatabase,
    })

    const created = await firstApp.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Durable", path: workspaceDir },
    })
    const workspace = WorkspaceSchema.parse(JSON.parse(created.body))

    await firstApp.close()
    firstDatabase.close()

    const secondDatabase = openDatabase({ dataDir })
    const secondRuntime = createRuntime("0.1.0")
    const secondApp = await createServer({
      config: firstConfig,
      runtime: secondRuntime,
      database: secondDatabase,
    })
    apps.push(secondApp)

    const listResponse = await secondApp.inject({ method: "GET", url: "/v1/workspaces" })
    const list = WorkspaceCollectionSchema.parse(JSON.parse(listResponse.body))

    expect(list.items.length).toBe(1)
    expect(list.items[0]?.id).toBe(workspace.id)
    expect(list.items[0]?.name).toBe("Durable")

    secondDatabase.close()
  })
})
