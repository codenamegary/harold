import { describe, expect, test } from "bun:test"
import { chmod, mkdir, stat } from "node:fs/promises"
import path from "node:path"
import { ConflictProblemSchema, ValidationProblemSchema } from "contracts/http/error"
import { FilesystemDirectoryCreatedSchema } from "contracts/http/filesystem.browse"
import { bootTestApp } from "../test-support/test.harness"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

const createDirectory = async (
  app: Awaited<ReturnType<typeof bootTestApp>>["app"],
  payload: { parent: string; name: string },
) =>
  app.inject({
    headers: authHeaders(app),
    method: "POST",
    url: "/v1/filesystem/directories",
    payload,
  })

describe("POST /v1/filesystem/directories", () => {
  test("creates one directory and returns its path", async () => {
    const { app, dataDir } = await bootTestApp()
    const parent = path.join(dataDir, "ops")
    await mkdir(parent)

    const response = await createDirectory(app, { parent, name: "widgets" })

    expect(response.statusCode).toBe(201)
    const body = FilesystemDirectoryCreatedSchema.parse(JSON.parse(response.body))
    expect(body).toEqual({ name: "widgets", path: path.join(parent, "widgets") })
    expect((await stat(path.join(parent, "widgets"))).isDirectory()).toBe(true)
  })

  test("returns 409 when the target already exists", async () => {
    const { app, dataDir } = await bootTestApp()
    const parent = path.join(dataDir, "ops")
    await mkdir(path.join(parent, "widgets"), { recursive: true })

    const response = await createDirectory(app, { parent, name: "widgets" })
    const body = ConflictProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("Directory already exists")
  })

  test("rejects a name with a path separator instead of creating recursively", async () => {
    const { app, dataDir } = await bootTestApp()
    const parent = path.join(dataDir, "ops")
    await mkdir(parent)

    const response = await createDirectory(app, { parent, name: "a/b" })
    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/name")
    expect(body.errors[0]?.code).toBe("validation.field.name.invalid")
    expect(await pathExists(path.join(parent, "a"))).toBe(false)
  })

  test("rejects dot names", async () => {
    const { app, dataDir } = await bootTestApp()
    const parent = path.join(dataDir, "ops")
    await mkdir(parent)

    for (const name of [".", ".."]) {
      const response = await createDirectory(app, { parent, name })
      const body = ValidationProblemSchema.parse(JSON.parse(response.body))
      expect(response.statusCode).toBe(400)
      expect(body.errors[0]?.pointer).toBe("#/name")
    }
  })

  test("returns 400 for a missing parent", async () => {
    const { app, dataDir } = await bootTestApp()

    const response = await createDirectory(app, {
      parent: path.join(dataDir, "nope"),
      name: "widgets",
    })
    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/parent")
    expect(body.errors[0]?.code).toBe("validation.field.parent.missing")
  })

  test("returns 400 when the parent is not writable", async () => {
    const { app, dataDir } = await bootTestApp()
    const parent = path.join(dataDir, "readonly")
    await mkdir(parent)
    await chmod(parent, 0o555)

    if (!(await chmodBlocksWrites(parent))) {
      await chmod(parent, 0o755)
      return
    }

    const response = await createDirectory(app, { parent, name: "widgets" })

    await chmod(parent, 0o755)

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/parent")
    expect(body.errors[0]?.code).toBe("validation.field.parent.not_writable")
  })
})

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

const chmodBlocksWrites = async (targetPath: string): Promise<boolean> => {
  try {
    await mkdir(path.join(targetPath, "probe"))
    await Bun.$`rmdir ${path.join(targetPath, "probe")}`.quiet()
    return false
  } catch {
    return true
  }
}
