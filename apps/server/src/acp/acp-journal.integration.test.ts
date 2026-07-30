import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnFakeAcp } from "test-support/spawn"
import { createAgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { createAcpJournalWriter } from "../acp/journal/acp.journal.writer"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { createEventCommitPublisher } from "../event/commit.publisher"
import { createEventJournalRepository } from "../event/journal.repository"
import { projectJournalEvents } from "../event/journal.transactional"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import { createAcpSupervisor } from "./supervisor/acp-supervisor"
import { SpawnedAgentProcess } from "./supervisor/spawn-agent-process"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"

const tempDirs: string[] = []
const fakeProcesses: Array<{ kill: () => void }> = []

const acceptTestExecutablePath: ValidateExecutablePathFn = () => true

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-acp-journal-"))
  tempDirs.push(dir)
  return dir
}

const waitFor = async (predicate: () => boolean, timeoutMs = 2000) => {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

afterEach(async () => {
  fakeProcesses.splice(0).forEach((process) => process.kill())
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("ACP journal integration", () => {
  test("journals prompt traffic and projects transcript and turn events", async () => {
    const dataDir = await createTempDataDir()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const eventJournal = createEventJournalRepository(database)
    const commitPublisher = createEventCommitPublisher()
    const journalWriter = createAcpJournalWriter({ database, eventJournal, commitPublisher })
    const published: string[] = []
    commitPublisher.subscribe((record) => {
      projectJournalEvents({ appendedRecords: [record] }).forEach((event) => {
        published.push(event.type)
      })
    })

    const spawnAgentProcessFn = (): SpawnedAgentProcess => {
      const fake = spawnFakeAcp({
        sessionNewSessionId: "fake-session-journal",
        emitSessionUpdatesOnPrompt: true,
      })
      fakeProcesses.push(fake)
      return {
        stdin: fake.stdin,
        stdout: fake.stdout,
        kill: () => fake.kill(),
        waitForExit: () => fake.process.exited,
      }
    }

    const agentSettingsRepository = createAgentSettingsRepository(database, {
      validateExecutablePathFn: acceptTestExecutablePath,
    })
    const acpSupervisor = createAcpSupervisor({
      agentSettingsRepository,
      serverVersion: runtime.version,
      journalWriter,
      spawnAgentProcessFn,
    })

    const { app } = await createServer({
      config,
      runtime,
      database,
      validateExecutablePathFn: acceptTestExecutablePath,
      acpSupervisor,
    })

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: "/fake/agent" },
    })
    await acpSupervisor.start("cursor")

    const created = await acpSupervisor.createAcpSession({
      workspaceCwd: "/tmp/ws",
      sessionId: "sess_journal",
      workspaceId: "ws_journal",
    })
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const prompt = await acpSupervisor.promptAcpSession({
      acpSessionId: created.acpSessionId,
      prompt: [{ type: "text", text: "secret prompt" }],
    })
    expect(prompt.ok).toBe(true)

    await waitFor(() => published.includes("turn.completed"))

    const records = eventJournal.readAfter({ cursor: 0n, limit: 100, sessionId: "sess_journal" })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    expect(records.value.some((record) => record.kind === "turn.started")).toBe(true)
    expect(records.value.some((record) => record.kind === "acp.request")).toBe(true)
    expect(records.value.some((record) => record.kind === "acp.response")).toBe(true)
    expect(records.value.some((record) => record.kind === "turn.completed")).toBe(true)

    const serialized = records.value
      .map((record) => `${record.kind}:${JSON.stringify(record.payload)}`)
      .join("|")
    expect(serialized.includes("secret prompt")).toBe(false)

    expect(published).toContain("session.output.delta")
    expect(published).toContain("session.output.complete")
    expect(published).toContain("turn.completed")

    await acpSupervisor.stop()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await app.close()
    database.close()
  })

  test("load replay updates journal without duplicate public transcript", async () => {
    const dataDir = await createTempDataDir()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const eventJournal = createEventJournalRepository(database)
    const commitPublisher = createEventCommitPublisher()
    const journalWriter = createAcpJournalWriter({ database, eventJournal, commitPublisher })
    const published: string[] = []
    commitPublisher.subscribe((record) => {
      projectJournalEvents({ appendedRecords: [record] }).forEach((event) => {
        published.push(event.type)
      })
    })

    const spawnAgentProcessFn = (): SpawnedAgentProcess => {
      const fake = spawnFakeAcp({
        capabilities: { loadSession: true, sessionClose: false },
        sessionNewSessionId: "fake-session-load",
        sessionLoadSessionId: "fake-session-load",
        emitLoadReplayUpdates: true,
      })
      fakeProcesses.push(fake)
      return {
        stdin: fake.stdin,
        stdout: fake.stdout,
        kill: () => fake.kill(),
        waitForExit: () => fake.process.exited,
      }
    }

    const agentSettingsRepository = {
      list: () => [{ id: "cursor" as const, enabled: true, path: "/fake/agent" }],
    }

    const acpSupervisor = createAcpSupervisor({
      agentSettingsRepository,
      serverVersion: runtime.version,
      journalWriter,
      spawnAgentProcessFn,
    })

    await acpSupervisor.start("cursor")

    const created = await acpSupervisor.createAcpSession({
      workspaceCwd: "/tmp/ws",
      sessionId: "sess_load",
      workspaceId: "ws_load",
    })
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    published.splice(0)

    const loaded = await acpSupervisor.loadAcpSession({
      acpSessionId: created.acpSessionId,
      workspaceCwd: "/tmp/ws",
      sessionId: "sess_load",
      workspaceId: "ws_load",
    })
    expect(loaded.ok).toBe(true)

    await waitFor(() =>
      eventJournal
        .readAfter({ cursor: 0n, limit: 100, sessionId: "sess_load" })
        .value?.some(
          (record) =>
            record.kind === "acp.notification" &&
            record.phase === "load_replay",
        ) === true,
    )

    expect(published.filter((type) => type === "session.output.delta")).toHaveLength(0)

    await acpSupervisor.stop()
    database.close()
  })
})
