import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ValidationProblemSchema } from "contracts/http/error"
import { FilesystemDirectoryCollectionSchema } from "contracts/http/filesystem.browse"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import { allowWorkspaceRoots } from "../test-support/create-test-app"

const tempDirs: string[] = []
const apps: Awaited<ReturnType<typeof createServer>>["app"][] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-fs-browse-"))
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
  return { app }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("GET /v1/filesystem/directories", () => {
  test("lists immediate child directories under an allowed root", async () => {
    const dataDir = await createTempDataDir()
    const root = path.join(dataDir, "code")
    await mkdir(root)
    await mkdir(path.join(root, "alpha"))
    await mkdir(path.join(root, "beta"))
    await mkdir(path.join(root, "alpha", "nested"))
    await writeFile(path.join(root, "readme.txt"), "hi")

    const { app } = await createTestApp(dataDir)
    await allowWorkspaceRoots(app, [root])

    const response = await app.inject({
      method: "GET",
      url: `/v1/filesystem/directories?root=${encodeURIComponent(root)}`,
    })

    expect(response.statusCode).toBe(200)
    const body = FilesystemDirectoryCollectionSchema.parse(JSON.parse(response.body))
    expect(body.items).toEqual([
      { name: "alpha", path: path.join(root, "alpha") },
      { name: "beta", path: path.join(root, "beta") },
    ])
  })

  test("rejects a root that is not an allowed root", async () => {
    const dataDir = await createTempDataDir()
    const allowed = path.join(dataDir, "allowed")
    const outside = path.join(dataDir, "outside")
    await mkdir(allowed)
    await mkdir(outside)
    await mkdir(path.join(outside, "child"))

    const { app } = await createTestApp(dataDir)
    await allowWorkspaceRoots(app, [allowed])

    const response = await app.inject({
      method: "GET",
      url: `/v1/filesystem/directories?root=${encodeURIComponent(outside)}`,
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.field.root.not_allowed")
  })

  test("rejects browsing a nested path instead of the allowed root", async () => {
    const dataDir = await createTempDataDir()
    const root = path.join(dataDir, "code")
    const nested = path.join(root, "alpha")
    await mkdir(nested, { recursive: true })

    const { app } = await createTestApp(dataDir)
    await allowWorkspaceRoots(app, [root])

    const response = await app.inject({
      method: "GET",
      url: `/v1/filesystem/directories?root=${encodeURIComponent(nested)}`,
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.field.root.not_allowed")
  })

  test("omits directories whose realpath escapes the allowed root", async () => {
    const dataDir = await createTempDataDir()
    const root = path.join(dataDir, "code")
    const outside = path.join(dataDir, "outside-target")
    await mkdir(root)
    await mkdir(outside)
    await mkdir(path.join(root, "safe"))
    await symlink(outside, path.join(root, "escape"))

    const { app } = await createTestApp(dataDir)
    await allowWorkspaceRoots(app, [root])

    const response = await app.inject({
      method: "GET",
      url: `/v1/filesystem/directories?root=${encodeURIComponent(root)}`,
    })

    expect(response.statusCode).toBe(200)
    const body = FilesystemDirectoryCollectionSchema.parse(JSON.parse(response.body))
    expect(body.items).toEqual([{ name: "safe", path: path.join(root, "safe") }])
  })
})
