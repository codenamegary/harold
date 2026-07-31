import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { openDatabase } from "../persistence/database"
import { sessions } from "../persistence/schema/sessions"
import { createEventJournalRepository } from "../event/journal.repository"
import { createEventCommitPublisher } from "../event/commit.publisher"
import { createWorkspaceRepository } from "../workspace/repository"
import { createSessionRepository } from "./repository"
import { createSessionService } from "./service"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-session-service-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("session service markLiveSessionsOffline", () => {
  test("marks live non-archived sessions offline and journals session.state", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const workspaceDir = path.join(dataDir, "project")
    await mkdir(workspaceDir)

    const workspaceRepository = createWorkspaceRepository(database)
    const workspace = workspaceRepository.create({ name: "Project", path: workspaceDir })
    expect(workspace.ok).toBe(true)
    if (!workspace.ok) {
      return
    }

    const eventJournal = createEventJournalRepository(database)
    const commitPublisher = createEventCommitPublisher()
    const sessionRepository = createSessionRepository(database)
    const sessionService = createSessionService({
      database,
      sessionRepository,
      eventJournal,
      commitPublisher,
    })

    const running = sessionRepository.create({
      workspaceId: workspace.value.id,
      agentId: "cursor",
      name: "Running",
      acpSessionId: "acp-running",
      state: "running",
    })
    const idle = sessionRepository.create({
      workspaceId: workspace.value.id,
      agentId: "cursor",
      name: "Idle",
      acpSessionId: "acp-idle",
      state: "idle",
    })
    const archived = sessionRepository.create({
      workspaceId: workspace.value.id,
      agentId: "cursor",
      name: "Archived",
      acpSessionId: "acp-archived",
    })
    expect(running.ok && idle.ok && archived.ok).toBe(true)
    if (!running.ok || !idle.ok || !archived.ok) {
      return
    }

    sessionRepository.archive({ id: archived.value.id })

    const marked = sessionService.markLiveSessionsOffline()
    expect(marked.ok).toBe(true)
    if (!marked.ok) {
      return
    }

    expect(marked.value.map((session) => session.id).sort()).toEqual(
      [running.value.id, idle.value.id].sort(),
    )
    expect(marked.value.every((session) => session.state === "offline")).toBe(true)

    const runningAfter = sessionRepository.getById({ id: running.value.id })
    const idleAfter = sessionRepository.getById({ id: idle.value.id })
    const archivedAfter = sessionRepository.getById({ id: archived.value.id })
    expect(runningAfter.ok && idleAfter.ok && archivedAfter.ok).toBe(true)
    if (!runningAfter.ok || !idleAfter.ok || !archivedAfter.ok) {
      return
    }

    expect(runningAfter.value.state).toBe("offline")
    expect(idleAfter.value.state).toBe("offline")
    expect(archivedAfter.value.state).toBe("archived")

    const runningRow = database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, running.value.id))
      .get()
    const idleRow = database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, idle.value.id))
      .get()
    expect(runningRow?.needsStartupRecovery).toBe(true)
    expect(idleRow?.needsStartupRecovery).toBe(false)

    const records = eventJournal.readAfter({ cursor: 0n, limit: 50 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    const offlineStates = records.value.filter(
      (record) =>
        record.kind === "session.state" &&
        (record.payload as { state: string }).state === "offline",
    )
    expect(offlineStates).toHaveLength(2)
    expect(offlineStates.map((record) => record.sessionId).sort()).toEqual(
      [running.value.id, idle.value.id].sort(),
    )

    database.close()
  })

  test("skips sessions already offline", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const workspaceDir = path.join(dataDir, "project")
    await mkdir(workspaceDir)

    const workspaceRepository = createWorkspaceRepository(database)
    const workspace = workspaceRepository.create({ name: "Project", path: workspaceDir })
    expect(workspace.ok).toBe(true)
    if (!workspace.ok) {
      return
    }

    const eventJournal = createEventJournalRepository(database)
    const commitPublisher = createEventCommitPublisher()
    const sessionRepository = createSessionRepository(database)
    const sessionService = createSessionService({
      database,
      sessionRepository,
      eventJournal,
      commitPublisher,
    })

    const offline = sessionRepository.create({
      workspaceId: workspace.value.id,
      agentId: "cursor",
      name: "Already offline",
      acpSessionId: "acp-offline",
      state: "offline",
    })
    expect(offline.ok).toBe(true)
    if (!offline.ok) {
      return
    }

    const marked = sessionService.markLiveSessionsOffline()
    expect(marked.ok).toBe(true)
    if (!marked.ok) {
      return
    }

    expect(marked.value).toEqual([])

    const records = eventJournal.readAfter({ cursor: 0n, limit: 20 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    expect(
      records.value.filter(
        (record) =>
          record.kind === "session.state" &&
          (record.payload as { state: string }).state === "offline",
      ),
    ).toHaveLength(0)

    database.close()
  })
})
