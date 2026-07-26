import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { openDatabase } from "../persistence/open-database"
import { workspaces } from "../persistence/schema/workspaces"
import { createWorkspaceRepository } from "./workspace-repository"
import { encodeWorkspacePageCursor } from "./workspace-page-cursor"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-workspace-repo-"))
  tempDirs.push(dir)
  return dir
}

const createWorkspaceDir = async (parent: string, name: string) => {
  const dir = path.join(parent, name)
  await mkdir(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("workspace repository", () => {
  test("creates a workspace with ws_ id and available state", async () => {
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")
    const database = openDatabase({ dataDir })
    const repository = createWorkspaceRepository(database)

    const result = repository.create("My Project", workspaceDir)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.id).toMatch(/^ws_[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(result.value.name).toBe("My Project")
      expect(result.value.path).toBe(path.resolve(workspaceDir))
      expect(result.value.state).toBe("available")
      expect(result.value.createdAt).toBe(result.value.lastUsedAt)
    }

    database.close()
  })

  test("rejects duplicate canonical paths", async () => {
    const dataDir = await createTempDataDir()
    const target = await createWorkspaceDir(dataDir, "target")
    const link = path.join(dataDir, "link")
    await symlink(target, link)
    const database = openDatabase({ dataDir })
    const repository = createWorkspaceRepository(database)

    const first = repository.create("First", target)
    const second = repository.create("Second", link)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.error.kind).toBe("duplicate_path")
    }

    database.close()
  })

  test("lists workspaces sorted by lastUsedAt desc then id asc", async () => {
    const dataDir = await createTempDataDir()
    const alpha = await createWorkspaceDir(dataDir, "alpha")
    const beta = await createWorkspaceDir(dataDir, "beta")
    const gamma = await createWorkspaceDir(dataDir, "gamma")
    const database = openDatabase({ dataDir })
    const repository = createWorkspaceRepository(database)

    const first = repository.create("Alpha", alpha)
    const second = repository.create("Beta", beta)
    const third = repository.create("Gamma", gamma)

    expect(first.ok && second.ok && third.ok).toBe(true)
    if (!first.ok || !second.ok || !third.ok) {
      return
    }

    const renamed = repository.updateName(second.value.id, "Beta Renamed")
    expect(renamed.ok).toBe(true)

    const listResult = repository.list({ limit: 100 })
    expect(listResult.ok).toBe(true)
    if (!listResult.ok) {
      return
    }

    expect(listResult.value.items.map((workspace) => workspace.id)).toEqual([
      second.value.id,
      third.value.id,
      first.value.id,
    ])

    database.close()
  })

  test("breaks ties on id asc when lastUsedAt matches", async () => {
    const dataDir = await createTempDataDir()
    const alpha = await createWorkspaceDir(dataDir, "alpha")
    const beta = await createWorkspaceDir(dataDir, "beta")
    const database = openDatabase({ dataDir })
    const repository = createWorkspaceRepository(database)
    const timestamp = "2026-01-01T00:00:00.000Z"

    database.db
      .insert(workspaces)
      .values([
        {
          id: "ws_ZZZZZZZZZZZZZZZZZZZZZZZZZZ",
          name: "Zulu",
          canonicalPath: alpha,
          createdAt: timestamp,
          lastUsedAt: timestamp,
        },
        {
          id: "ws_AAAAAAAAAAAAAAAAAAAAAAAAA",
          name: "Alpha",
          canonicalPath: beta,
          createdAt: timestamp,
          lastUsedAt: timestamp,
        },
      ])
      .run()

    const listResult = repository.list({ limit: 100 })
    expect(listResult.ok).toBe(true)
    if (!listResult.ok) {
      return
    }

    expect(listResult.value.items.map((workspace) => workspace.id)).toEqual([
      "ws_AAAAAAAAAAAAAAAAAAAAAAAAA",
      "ws_ZZZZZZZZZZZZZZZZZZZZZZZZZZ",
    ])

    database.close()
  })

  test("gets, renames, and deletes by id", async () => {
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")
    const database = openDatabase({ dataDir })
    const repository = createWorkspaceRepository(database)

    const created = repository.create("Original", workspaceDir)
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const fetched = repository.getById(created.value.id)
    expect(fetched.ok).toBe(true)
    if (fetched.ok) {
      expect(fetched.value.name).toBe("Original")
      expect(fetched.value.state).toBe("available")
    }

    const renamed = repository.updateName(created.value.id, "Renamed")
    expect(renamed.ok).toBe(true)
    if (renamed.ok) {
      expect(renamed.value.name).toBe("Renamed")
      expect(renamed.value.lastUsedAt >= created.value.lastUsedAt).toBe(true)
    }

    const deleted = repository.delete(created.value.id)
    expect(deleted.ok).toBe(true)

    const missing = repository.getById(created.value.id)
    expect(missing.ok).toBe(false)
    if (!missing.ok) {
      expect(missing.error.kind).toBe("not_found")
    }

    database.close()
  })

  test("pages forward with opaque cursors and count", async () => {
    const dataDir = await createTempDataDir()
    const dirs = await Promise.all([
      createWorkspaceDir(dataDir, "one"),
      createWorkspaceDir(dataDir, "two"),
      createWorkspaceDir(dataDir, "three"),
    ])
    const database = openDatabase({ dataDir })
    const repository = createWorkspaceRepository(database)

    for (const [index, dir] of dirs.entries()) {
      const created = repository.create(`Workspace ${index + 1}`, dir)
      expect(created.ok).toBe(true)
    }

    const firstPage = repository.list({ limit: 2 })
    expect(firstPage.ok).toBe(true)
    if (!firstPage.ok) {
      return
    }

    expect(firstPage.value.items.length).toBe(2)
    expect(firstPage.value.count).toBe(3)
    expect(firstPage.value.nextCursor).toBeDefined()

    const secondPage = repository.list({
      limit: 2,
      cursor: firstPage.value.nextCursor,
    })
    expect(secondPage.ok).toBe(true)
    if (!secondPage.ok) {
      return
    }

    expect(secondPage.value.items.length).toBe(1)
    expect(secondPage.value.nextCursor).toBeUndefined()

    const invalid = repository.list({
      cursor: encodeWorkspacePageCursor({
        id: "ws_01J0000000000000000000000",
        edge: "after",
      }),
    })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(invalid.error.kind).toBe("invalid_cursor")
    }

    database.close()
  })

  test("pages backward with encoded previous cursor", async () => {
    const dataDir = await createTempDataDir()
    const dirs = await Promise.all([
      createWorkspaceDir(dataDir, "one"),
      createWorkspaceDir(dataDir, "two"),
      createWorkspaceDir(dataDir, "three"),
    ])
    const database = openDatabase({ dataDir })
    const repository = createWorkspaceRepository(database)

    for (const [index, dir] of dirs.entries()) {
      const created = repository.create(`Workspace ${index + 1}`, dir)
      expect(created.ok).toBe(true)
    }

    const firstPage = repository.list({ limit: 2 })
    expect(firstPage.ok).toBe(true)
    if (!firstPage.ok) {
      return
    }

    const secondPage = repository.list({
      limit: 2,
      cursor: firstPage.value.nextCursor,
    })
    expect(secondPage.ok).toBe(true)
    if (!secondPage.ok) {
      return
    }

    const backToFirst = repository.list({
      limit: 2,
      cursor: secondPage.value.previousCursor,
    })
    expect(backToFirst.ok).toBe(true)
    if (!backToFirst.ok) {
      return
    }

    expect(backToFirst.value.items.map((workspace) => workspace.id)).toEqual(
      firstPage.value.items.map((workspace) => workspace.id),
    )

    database.close()
  })

  test("returns not_found for missing ids", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createWorkspaceRepository(database)

    const getResult = repository.getById("ws_01J0000000000000000000000")
    const updateResult = repository.updateName("ws_01J0000000000000000000000", "Nope")
    const deleteResult = repository.delete("ws_01J0000000000000000000000")

    expect(getResult.ok).toBe(false)
    expect(updateResult.ok).toBe(false)
    expect(deleteResult.ok).toBe(false)

    if (!getResult.ok) {
      expect(getResult.error.kind).toBe("not_found")
    }

    database.close()
  })

  test("reports missing state when directory is removed after create", async () => {
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "ephemeral")
    const database = openDatabase({ dataDir })
    const repository = createWorkspaceRepository(database)

    const created = repository.create("Ephemeral", workspaceDir)
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    await rm(workspaceDir, { recursive: true, force: true })

    const fetched = repository.getById(created.value.id)
    expect(fetched.ok).toBe(true)
    if (fetched.ok) {
      expect(fetched.value.state).toBe("missing")
    }

    database.close()
  })
})
