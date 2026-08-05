import { afterEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { openDatabase } from "../persistence/database"
import { sessions } from "../persistence/schema/sessions"
import { workspaces } from "../persistence/schema/workspaces"
import { createWorkspaceRepository } from "../workspace/repository"
import { createSessionRepository } from "./repository"
import { encodeSessionPageCursor } from "./session-page-cursor"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-session-repo-"))
  tempDirs.push(dir)
  return dir
}

const createWorkspaceDir = async (parent: string, name: string) => {
  const dir = path.join(parent, name)
  await mkdir(dir)
  return dir
}

const seedWorkspace = async (dataDir: string, name = "Project") => {
  const workspaceDir = await createWorkspaceDir(dataDir, "workspace")
  const database = openDatabase({ dataDir })
  const workspaceRepository = createWorkspaceRepository(database, {
    getAllowedRoots: () => [path.resolve(dataDir)],
  })
  const created = workspaceRepository.create({ name, path: workspaceDir })
  if (!created.ok) {
    throw new Error("failed to seed workspace")
  }
  return { database, workspaceId: created.value.id }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("session repository", () => {
  test("creates a session with sess_ id and excludes acpSessionId from output", async () => {
    const dataDir = await createTempDataDir()
    const { database, workspaceId } = await seedWorkspace(dataDir)
    const repository = createSessionRepository(database)

    const result = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Debug auth",
      acpSessionId: "acp-internal-123",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.id).toMatch(/^sess_[0-9A-HJKMNP-TV-Z]{26}$/)
      expect(result.value.workspaceId).toBe(workspaceId)
      expect(result.value.agentId).toBe("cursor")
      expect(result.value.name).toBe("Debug auth")
      expect(result.value.state).toBe("idle")
      expect(result.value.createdAt).toBe(result.value.lastUsedAt)
      expect(result.value.archivedAt).toBeNull()
      expect("acpSessionId" in result.value).toBe(false)
    }

    const row = database.db.select().from(sessions).get()
    expect(row?.acpSessionId).toBe("acp-internal-123")
    expect(row?.resumable).toBe(false)

    database.close()
  })

  test("lists sessions by workspace sorted by lastUsedAt desc then id asc", async () => {
    const dataDir = await createTempDataDir()
    const { database, workspaceId } = await seedWorkspace(dataDir)
    const repository = createSessionRepository(database)

    const first = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Alpha",
      acpSessionId: "acp-1",
    })
    const second = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Beta",
      acpSessionId: "acp-2",
    })
    const third = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Gamma",
      acpSessionId: "acp-3",
    })

    expect(first.ok && second.ok && third.ok).toBe(true)
    if (!first.ok || !second.ok || !third.ok) {
      return
    }

    database.db
      .update(sessions)
      .set({ lastUsedAt: "2026-01-01T00:00:00.000Z" })
      .where(eq(sessions.id, first.value.id))
      .run()
    database.db
      .update(sessions)
      .set({ lastUsedAt: "2026-01-01T00:01:00.000Z" })
      .where(eq(sessions.id, third.value.id))
      .run()

    const selected = repository.select({ id: second.value.id })
    expect(selected.ok).toBe(true)

    const listResult = repository.list({ workspaceId, limit: 100 })
    expect(listResult.ok).toBe(true)
    if (!listResult.ok) {
      return
    }

    expect(listResult.value.items.map((session) => session.id)).toEqual([
      second.value.id,
      third.value.id,
      first.value.id,
    ])

    database.close()
  })

  test("breaks ties on id asc when lastUsedAt matches", async () => {
    const dataDir = await createTempDataDir()
    const { database, workspaceId } = await seedWorkspace(dataDir)
    const repository = createSessionRepository(database)
    const timestamp = "2026-01-01T00:00:00.000Z"

    database.db
      .insert(sessions)
      .values([
        {
          id: "sess_ZZZZZZZZZZZZZZZZZZZZZZZZZ",
          workspaceId,
          agentId: "cursor",
          name: "Zulu",
          state: "idle",
          acpSessionId: "acp-z",
          createdAt: timestamp,
          lastUsedAt: timestamp,
          archivedAt: null,
          resumable: false,
        },
        {
          id: "sess_AAAAAAAAAAAAAAAAAAAAAAAA",
          workspaceId,
          agentId: "cursor",
          name: "Alpha",
          state: "idle",
          acpSessionId: "acp-a",
          createdAt: timestamp,
          lastUsedAt: timestamp,
          archivedAt: null,
          resumable: false,
        },
      ])
      .run()

    const listResult = repository.list({ workspaceId, limit: 100 })
    expect(listResult.ok).toBe(true)
    if (!listResult.ok) {
      return
    }

    expect(listResult.value.items.map((session) => session.id)).toEqual([
      "sess_AAAAAAAAAAAAAAAAAAAAAAAA",
      "sess_ZZZZZZZZZZZZZZZZZZZZZZZZZ",
    ])

    database.close()
  })

  test("gets, renames, selects, and archives by id", async () => {
    const dataDir = await createTempDataDir()
    const { database, workspaceId } = await seedWorkspace(dataDir)
    const repository = createSessionRepository(database)

    const created = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Original",
      acpSessionId: "acp-original",
    })
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const fetched = repository.getById({ id: created.value.id })
    expect(fetched.ok).toBe(true)
    if (fetched.ok) {
      expect(fetched.value.name).toBe("Original")
      expect(fetched.value.state).toBe("idle")
    }

    const renamed = repository.rename({ id: created.value.id, name: "Renamed" })
    expect(renamed.ok).toBe(true)
    if (renamed.ok) {
      expect(renamed.value.name).toBe("Renamed")
    }

    const selected = repository.select({ id: created.value.id })
    expect(selected.ok).toBe(true)
    if (selected.ok) {
      expect(selected.value.lastUsedAt >= created.value.lastUsedAt).toBe(true)
    }

    const archived = repository.archive({ id: created.value.id })
    expect(archived.ok).toBe(true)
    if (archived.ok) {
      expect(archived.value.state).toBe("archived")
      expect(archived.value.archivedAt).not.toBeNull()
    }

    database.close()
  })

  test("setState updates running and idle turn states", async () => {
    const dataDir = await createTempDataDir()
    const { database, workspaceId } = await seedWorkspace(dataDir)
    const repository = createSessionRepository(database)

    const created = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Turn state",
      acpSessionId: "acp-turn-state",
    })
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const running = repository.setState({ id: created.value.id, state: "running" })
    expect(running.ok).toBe(true)
    if (running.ok) {
      expect(running.value.state).toBe("running")
    }

    const idle = repository.setState({ id: created.value.id, state: "idle" })
    expect(idle.ok).toBe(true)
    if (idle.ok) {
      expect(idle.value.state).toBe("idle")
    }

    database.close()
  })

  test("pages forward with opaque cursors and count scoped to workspace", async () => {
    const dataDir = await createTempDataDir()
    const { database, workspaceId } = await seedWorkspace(dataDir)
    const otherWorkspaceDir = await createWorkspaceDir(dataDir, "other")
    const workspaceRepository = createWorkspaceRepository(database, {
      getAllowedRoots: () => [path.resolve(dataDir)],
    })
    const otherWorkspace = workspaceRepository.create({
      name: "Other",
      path: otherWorkspaceDir,
    })
    expect(otherWorkspace.ok).toBe(true)
    if (!otherWorkspace.ok) {
      return
    }

    const repository = createSessionRepository(database)

    for (const [index, name] of ["One", "Two", "Three"].entries()) {
      const created = repository.create({
        workspaceId,
        agentId: "cursor",
        name: `Session ${index + 1} (${name})`,
        acpSessionId: `acp-${index}`,
      })
      expect(created.ok).toBe(true)
    }

    repository.create({
      workspaceId: otherWorkspace.value.id,
      agentId: "cursor",
      name: "Other workspace session",
      acpSessionId: "acp-other",
    })

    const firstPage = repository.list({ workspaceId, limit: 2 })
    expect(firstPage.ok).toBe(true)
    if (!firstPage.ok) {
      return
    }

    expect(firstPage.value.items.length).toBe(2)
    expect(firstPage.value.count).toBe(3)
    expect(firstPage.value.nextCursor).toBeDefined()

    const secondPage = repository.list({
      workspaceId,
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
      workspaceId,
      cursor: encodeSessionPageCursor({
        id: "sess_01J0000000000000000000000",
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
    const { database, workspaceId } = await seedWorkspace(dataDir)
    const repository = createSessionRepository(database)

    for (const [index, name] of ["One", "Two", "Three"].entries()) {
      const created = repository.create({
        workspaceId,
        agentId: "cursor",
        name: `Session ${index + 1} (${name})`,
        acpSessionId: `acp-${index}`,
      })
      expect(created.ok).toBe(true)
    }

    const firstPage = repository.list({ workspaceId, limit: 2 })
    expect(firstPage.ok).toBe(true)
    if (!firstPage.ok) {
      return
    }

    const secondPage = repository.list({
      workspaceId,
      limit: 2,
      cursor: firstPage.value.nextCursor,
    })
    expect(secondPage.ok).toBe(true)
    if (!secondPage.ok) {
      return
    }

    const backToFirst = repository.list({
      workspaceId,
      limit: 2,
      cursor: secondPage.value.previousCursor,
    })
    expect(backToFirst.ok).toBe(true)
    if (!backToFirst.ok) {
      return
    }

    expect(backToFirst.value.items.map((session) => session.id)).toEqual(
      firstPage.value.items.map((session) => session.id),
    )

    database.close()
  })

  test("returns not_found for missing ids", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createSessionRepository(database)

    const getResult = repository.getById({ id: "sess_01J0000000000000000000000" })
    const renameResult = repository.rename({
      id: "sess_01J0000000000000000000000",
      name: "Nope",
    })
    const selectResult = repository.select({ id: "sess_01J0000000000000000000000" })
    const archiveResult = repository.archive({ id: "sess_01J0000000000000000000000" })

    expect(getResult.ok).toBe(false)
    expect(renameResult.ok).toBe(false)
    expect(selectResult.ok).toBe(false)
    expect(archiveResult.ok).toBe(false)

    if (!getResult.ok) {
      expect(getResult.error.kind).toBe("not_found")
    }

    database.close()
  })

  test("cascades session delete when workspace is deleted", async () => {
    const dataDir = await createTempDataDir()
    const { database, workspaceId } = await seedWorkspace(dataDir)
    const repository = createSessionRepository(database)

    const created = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Cascade me",
      acpSessionId: "acp-cascade",
    })
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    database.db.delete(workspaces).where(eq(workspaces.id, workspaceId)).run()

    const remaining = database.db.select().from(sessions).all()
    expect(remaining).toEqual([])

    database.close()
  })

  test("listLiveNonArchived returns non-archived sessions across workspaces", async () => {
    const dataDir = await createTempDataDir()
    const { database, workspaceId } = await seedWorkspace(dataDir)
    const otherWorkspaceDir = await createWorkspaceDir(dataDir, "other")
    const workspaceRepository = createWorkspaceRepository(database, {
      getAllowedRoots: () => [path.resolve(dataDir)],
    })
    const otherWorkspace = workspaceRepository.create({
      name: "Other",
      path: otherWorkspaceDir,
    })
    expect(otherWorkspace.ok).toBe(true)
    if (!otherWorkspace.ok) {
      return
    }

    const repository = createSessionRepository(database)

    const running = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Running",
      acpSessionId: "acp-running",
      state: "running",
    })
    const idle = repository.create({
      workspaceId: otherWorkspace.value.id,
      agentId: "cursor",
      name: "Idle",
      acpSessionId: "acp-idle",
      state: "idle",
    })
    const archived = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Archived",
      acpSessionId: "acp-archived",
    })
    expect(running.ok && idle.ok && archived.ok).toBe(true)
    if (!running.ok || !idle.ok || !archived.ok) {
      return
    }

    repository.archive({ id: archived.value.id })

    const live = repository.listLiveNonArchived()
    const liveIds = live.map((session) => session.id).sort()

    expect(liveIds).toEqual([idle.value.id, running.value.id].toSorted())
    expect(live.every((session) => session.state !== "archived")).toBe(true)

    database.close()
  })

  test("lists active sessions across workspaces sorted by lastUsedAt desc when workspaceId is omitted", async () => {
    const dataDir = await createTempDataDir()
    const { database, workspaceId } = await seedWorkspace(dataDir)
    const otherWorkspaceDir = await createWorkspaceDir(dataDir, "other")
    const workspaceRepository = createWorkspaceRepository(database, {
      getAllowedRoots: () => [path.resolve(dataDir)],
    })
    const otherWorkspace = workspaceRepository.create({
      name: "Other",
      path: otherWorkspaceDir,
    })
    expect(otherWorkspace.ok).toBe(true)
    if (!otherWorkspace.ok) {
      return
    }

    const repository = createSessionRepository(database)

    const older = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Older",
      acpSessionId: "acp-older",
    })
    const newer = repository.create({
      workspaceId: otherWorkspace.value.id,
      agentId: "cursor",
      name: "Newer",
      acpSessionId: "acp-newer",
    })
    const archived = repository.create({
      workspaceId,
      agentId: "cursor",
      name: "Archived",
      acpSessionId: "acp-archived",
    })
    expect(older.ok && newer.ok && archived.ok).toBe(true)
    if (!older.ok || !newer.ok || !archived.ok) {
      return
    }

    database.db
      .update(sessions)
      .set({ lastUsedAt: "2026-01-01T00:00:00.000Z" })
      .where(eq(sessions.id, older.value.id))
      .run()
    database.db
      .update(sessions)
      .set({ lastUsedAt: "2026-01-02T00:00:00.000Z" })
      .where(eq(sessions.id, newer.value.id))
      .run()

    repository.archive({ id: archived.value.id })

    const listResult = repository.list({ limit: 100 })
    expect(listResult.ok).toBe(true)
    if (!listResult.ok) {
      return
    }

    expect(listResult.value.items.map((session) => session.id)).toEqual([
      newer.value.id,
      older.value.id,
    ])
    expect(listResult.value.count).toBe(2)

    database.close()
  })
})
