import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ValidationProblemSchema } from "contracts/http/error"
import { FilesystemDirectoryCollectionSchema } from "contracts/http/filesystem.browse"
import { bootTestApp } from "../test-support/test.harness"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

describe("GET /v1/filesystem/directories", () => {
  test("lists immediate child directories of any readable path", async () => {
    const { app, dataDir } = await bootTestApp()
    const root = path.join(dataDir, "code")
    await mkdir(root)
    await mkdir(path.join(root, "alpha"))
    await mkdir(path.join(root, "beta"))
    await mkdir(path.join(root, "alpha", "nested"))
    await writeFile(path.join(root, "readme.txt"), "hi")

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: `/v1/filesystem/directories?root=${encodeURIComponent(root)}`,
    })

    expect(response.statusCode).toBe(200)
    const body = FilesystemDirectoryCollectionSchema.parse(JSON.parse(response.body))
    expect(body.path).toBe(path.resolve(root))
    expect(body.parent).toBe(path.dirname(path.resolve(root)))
    expect(body.items).toEqual([
      { name: "alpha", path: path.join(root, "alpha") },
      { name: "beta", path: path.join(root, "beta") },
    ])
  })

  test("starts at the server user's home directory when root is omitted", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/filesystem/directories",
    })

    expect(response.statusCode).toBe(200)
    const body = FilesystemDirectoryCollectionSchema.parse(JSON.parse(response.body))
    expect(body.path).toBe(path.resolve(os.homedir()))
    expect(body.parent).toBe(path.dirname(path.resolve(os.homedir())))
  })

  test("accepts nested paths and paths outside the data directory", async () => {
    const { app } = await bootTestApp()
    const root = await mkdtemp(path.join(os.tmpdir(), "harold-browse-"))
    const nested = path.join(root, "a", "b")
    await mkdir(nested, { recursive: true })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: `/v1/filesystem/directories?root=${encodeURIComponent(nested)}`,
    })

    expect(response.statusCode).toBe(200)
    const body = FilesystemDirectoryCollectionSchema.parse(JSON.parse(response.body))
    expect(body.path).toBe(path.resolve(nested))

    await rm(root, { recursive: true, force: true })
  })

  test("returns null parent at the filesystem root", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/filesystem/directories?root=%2F",
    })

    expect(response.statusCode).toBe(200)
    const body = FilesystemDirectoryCollectionSchema.parse(JSON.parse(response.body))
    expect(body.path).toBe("/")
    expect(body.parent).toBeNull()
  })

  test("follows directory symlinks and reports their canonical target", async () => {
    const { app, dataDir } = await bootTestApp()
    const root = path.join(dataDir, "code")
    const target = path.join(dataDir, "target")
    await mkdir(root)
    await mkdir(target)
    await mkdir(path.join(root, "safe"))
    await symlink(target, path.join(root, "link"))

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: `/v1/filesystem/directories?root=${encodeURIComponent(root)}`,
    })

    expect(response.statusCode).toBe(200)
    const body = FilesystemDirectoryCollectionSchema.parse(JSON.parse(response.body))
    expect(body.items).toEqual([
      { name: "link", path: path.resolve(target) },
      { name: "safe", path: path.join(root, "safe") },
    ])
  })

  test("returns 400 for a missing root", async () => {
    const { app, dataDir } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: `/v1/filesystem/directories?root=${encodeURIComponent(path.join(dataDir, "nope"))}`,
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/root")
    expect(body.errors[0]?.code).toBe("validation.field.root.missing")
  })

  test("returns 400 for a file root", async () => {
    const { app, dataDir } = await bootTestApp()
    const filePath = path.join(dataDir, "file.txt")
    await writeFile(filePath, "hi")

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: `/v1/filesystem/directories?root=${encodeURIComponent(filePath)}`,
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.field.root.not_directory")
  })
})
