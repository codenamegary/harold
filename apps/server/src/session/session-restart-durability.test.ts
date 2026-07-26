import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { openDatabase } from "../persistence/open-database"
import { createWorkspaceRepository } from "../workspace/workspace-repository"
import { createSessionRepository } from "./session-repository"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-session-restart-"))
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

describe("session persistence restart durability", () => {
  test("session metadata survives database close and reopen", async () => {
    const dataDir = await createTempDataDir()
    const workspaceDir = await createWorkspaceDir(dataDir, "project")

    const firstDatabase = openDatabase({ dataDir })
    const workspaceRepository = createWorkspaceRepository(firstDatabase)
    const sessionRepository = createSessionRepository(firstDatabase)

    const workspace = workspaceRepository.create({ name: "Project", path: workspaceDir })
    expect(workspace.ok).toBe(true)
    if (!workspace.ok) {
      return
    }

    const created = sessionRepository.create({
      workspaceId: workspace.value.id,
      name: "Persist me",
      acpSessionId: "acp-persist-1",
      state: "running",
    })
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const selected = sessionRepository.select({ id: created.value.id })
    expect(selected.ok).toBe(true)

    firstDatabase.close()

    const secondDatabase = openDatabase({ dataDir })
    const reopenedRepository = createSessionRepository(secondDatabase)
    const fetched = reopenedRepository.getById({ id: created.value.id })

    expect(fetched.ok).toBe(true)
    if (fetched.ok) {
      expect(fetched.value.id).toBe(created.value.id)
      expect(fetched.value.workspaceId).toBe(workspace.value.id)
      expect(fetched.value.name).toBe("Persist me")
      expect(fetched.value.state).toBe("running")
      expect(fetched.value.archivedAt).toBeNull()
      expect("acpSessionId" in fetched.value).toBe(false)
    }

    secondDatabase.close()
  })
})
