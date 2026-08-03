import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  AllowedRootHasWorkspacesProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { WorkspaceCollectionSchema, WorkspaceSchema } from "contracts/http/workspace"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import { allowWorkspaceRoots } from "../test-support/create-test-app"
const tempDirs: string[] = []
const apps: Awaited<ReturnType<typeof createServer>>["app"][] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-allowed-roots-"))
  tempDirs.push(dir)
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
  const { app } = await createServer({ config, runtime, database })
  apps.push(app)
  return { app, database, config }
}

const createWorkspaceDir = async (parent: string, name: string) => {
  const dir = path.join(parent, name)
  await mkdir(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("allowed roots enforcement", () => {
  test("rejects workspace registration when allowedRoots is empty", async () => {
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Project", path: workspaceDir },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.field.path.outside_allowed_root")
  })

  test("accepts workspace registration under an allowed root", async () => {
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")
    const { app } = await createTestApp(dataDir)

    await allowWorkspaceRoots(app, [dataDir])

    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Project", path: workspaceDir },
    })

    expect(response.statusCode).toBe(201)
    WorkspaceSchema.parse(JSON.parse(response.body))
  })

  test("rejects workspace registration outside allowed roots", async () => {
    const dataDir = await createTempDataDir()
    const allowedDir = await createWorkspaceDir(dataDir, "allowed")
    const outsideDir = await createWorkspaceDir(dataDir, "outside")
    const { app } = await createTestApp(dataDir)

    await allowWorkspaceRoots(app, [allowedDir])

    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Outside", path: outsideDir },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.field.path.outside_allowed_root")
  })

  test("rejects symlink escape outside allowed root", async () => {
    const dataDir = await createTempDataDir()
    const allowedDir = await createWorkspaceDir(dataDir, "allowed")
    const outsideDir = await createWorkspaceDir(dataDir, "outside")
    const link = path.join(allowedDir, "escape-link")
    await symlink(outsideDir, link)
    const { app } = await createTestApp(dataDir)

    await allowWorkspaceRoots(app, [allowedDir])

    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Escape", path: link },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.field.path.outside_allowed_root")
  })
})

describe("PATCH /v1/settings/runtime allowedRoots", () => {
  test("canonicalizes and dedupes allowed roots", async () => {
    const dataDir = await createTempDataDir()
    const rootDir = await createWorkspaceDir(dataDir, "roots")
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { allowedRoots: [rootDir, rootDir] },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body) as { settings: { allowedRoots: string[] } }
    expect(body.settings.allowedRoots).toEqual([path.resolve(rootDir)])
  })

  test("returns 409 with forceDeleteAvailable when removing a root with workspaces", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    await allowWorkspaceRoots(app, [dataDir])
    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: {
        name: "Project",
        path: await createWorkspaceDir(dataDir, "project"),
      },
    })

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { allowedRoots: [] },
    })

    const problem = AllowedRootHasWorkspacesProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(problem.forceDeleteAvailable).toBe(true)
  })

  test("removes root and unregisters workspaces with force=true", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    await allowWorkspaceRoots(app, [dataDir])
    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: {
        name: "Project",
        path: await createWorkspaceDir(dataDir, "project"),
      },
    })

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime?force=true",
      payload: { allowedRoots: [] },
    })

    expect(response.statusCode).toBe(200)

    const listResponse = await app.inject({ method: "GET", url: "/v1/workspaces" })
    const list = WorkspaceCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(list.items).toEqual([])
  })
})
