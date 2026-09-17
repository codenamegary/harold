import { describe, expect, test } from "bun:test"
import { mkdir, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { ValidationProblemSchema } from "contracts/http/error"
import { FilesystemDirectoryCollectionSchema } from "contracts/http/filesystem.browse"
import { bootTestApp } from "../test-support/test.harness"
import { allowWorkspaceRoots } from "../test-support/test.app"

describe("GET /v1/filesystem/directories", () => {
  test("lists immediate child directories under an allowed root", async () => {
    const { app, dataDir } = await bootTestApp()
    const root = path.join(dataDir, "code")
    await mkdir(root)
    await mkdir(path.join(root, "alpha"))
    await mkdir(path.join(root, "beta"))
    await mkdir(path.join(root, "alpha", "nested"))
    await writeFile(path.join(root, "readme.txt"), "hi")

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
    const { app, dataDir } = await bootTestApp()
    const allowed = path.join(dataDir, "allowed")
    const outside = path.join(dataDir, "outside")
    await mkdir(allowed)
    await mkdir(outside)
    await mkdir(path.join(outside, "child"))

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
    const { app, dataDir } = await bootTestApp()
    const root = path.join(dataDir, "code")
    const nested = path.join(root, "alpha")
    await mkdir(nested, { recursive: true })

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
    const { app, dataDir } = await bootTestApp()
    const root = path.join(dataDir, "code")
    const outside = path.join(dataDir, "outside-target")
    await mkdir(root)
    await mkdir(outside)
    await mkdir(path.join(root, "safe"))
    await symlink(outside, path.join(root, "escape"))

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
