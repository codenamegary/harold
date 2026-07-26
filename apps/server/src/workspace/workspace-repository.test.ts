import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { openDatabase } from "../persistence/open-database"
import { createWorkspaceRepository } from "./workspace-repository"

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

    const items = repository.list()
    expect(items.map((workspace) => workspace.id)).toEqual([
      second.value.id,
      third.value.id,
      first.value.id,
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
