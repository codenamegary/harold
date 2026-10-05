import { describe, expect, test } from "bun:test"
import { symlink } from "node:fs/promises"
import path from "node:path"
import {
  AllowedRootHasWorkspacesProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { WorkspaceCollectionSchema, WorkspaceSchema } from "contracts/http/workspace"
import { bootTestApp } from "../test-support/test.harness"
import { allowWorkspaceRoots, createWorkspaceDir } from "../test-support/test.app"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

describe("allowed roots enforcement", () => {
  test("rejects workspace registration when allowedRoots is empty", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Project", path: workspaceDir },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.field.path.outside_allowed_root")
  })

  test("accepts workspace registration under an allowed root", async () => {
    const { app, dataDir } = await bootTestApp()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")

    await allowWorkspaceRoots(app, [dataDir])

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Project", path: workspaceDir },
    })

    expect(response.statusCode).toBe(201)
    WorkspaceSchema.parse(JSON.parse(response.body))
  })

  test("rejects workspace registration outside allowed roots", async () => {
    const { app, dataDir } = await bootTestApp()
    const allowedDir = await createWorkspaceDir(dataDir, "allowed")
    const outsideDir = await createWorkspaceDir(dataDir, "outside")

    await allowWorkspaceRoots(app, [allowedDir])

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Outside", path: outsideDir },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.field.path.outside_allowed_root")
  })

  test("rejects symlink escape outside allowed root", async () => {
    const { app, dataDir } = await bootTestApp()
    const allowedDir = await createWorkspaceDir(dataDir, "allowed")
    const outsideDir = await createWorkspaceDir(dataDir, "outside")
    const link = path.join(allowedDir, "escape-link")
    await symlink(outsideDir, link)

    await allowWorkspaceRoots(app, [allowedDir])

    const response = await app.inject({
      headers: authHeaders(app),
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
    const { app, dataDir } = await bootTestApp()
    const rootDir = await createWorkspaceDir(dataDir, "roots")

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { allowedRoots: [rootDir, rootDir] },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body) as { settings: { allowedRoots: string[] } }
    expect(body.settings.allowedRoots).toEqual([path.resolve(rootDir)])
  })

  test("returns 409 with forceDeleteAvailable when removing a root with workspaces", async () => {
    const { app, dataDir } = await bootTestApp()

    await allowWorkspaceRoots(app, [dataDir])
    await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/workspaces",
      payload: {
        name: "Project",
        path: await createWorkspaceDir(dataDir, "project"),
      },
    })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { allowedRoots: [] },
    })

    const problem = AllowedRootHasWorkspacesProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(problem.forceDeleteAvailable).toBe(true)
  })

  test("removes root and unregisters workspaces with force=true", async () => {
    const { app, dataDir } = await bootTestApp()

    await allowWorkspaceRoots(app, [dataDir])
    await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/workspaces",
      payload: {
        name: "Project",
        path: await createWorkspaceDir(dataDir, "project"),
      },
    })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/runtime?force=true",
      payload: { allowedRoots: [] },
    })

    expect(response.statusCode).toBe(200)

    const listResponse = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/workspaces",
    })
    const list = WorkspaceCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(list.items).toEqual([])
  })
})
