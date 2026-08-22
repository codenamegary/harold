import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnFakeAcp } from "test-support/spawn"
import { createAgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import { createAcpSupervisor } from "./supervisor/supervisor"
import { SpawnedAgentProcess } from "./supervisor/spawn.agent.process"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"

const tempDirs: string[] = []
const fakeProcesses: Array<{ kill: () => void }> = []

const acceptTestExecutablePath: ValidateExecutablePathFn = () => true

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-acp-prompt-"))
  tempDirs.push(dir)
  return dir
}

const waitFor = async (predicate: () => boolean, timeoutMs = 1000) => {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

afterEach(async () => {
  fakeProcesses.splice(0).forEach((process) => process.kill())
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("ACP prompt, update, and cancel integration", () => {
  test("prompt receives updates and cancel stops deferred updates", async () => {
    const dataDir = await createTempDataDir()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "3849",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const sessionUpdates: Array<{ acpSessionId: string; update: unknown }> = []

    const spawnAgentProcessFn = (): SpawnedAgentProcess => {
      const fake = spawnFakeAcp({
        sessionNewSessionId: "fake-session-prompt",
        emitSessionUpdatesOnPrompt: true,
      })
      fakeProcesses.push(fake)
      return {
        stdin: fake.stdin,
        stdout: fake.stdout,
        kill: () => {
          fake.kill()
        },
        waitForExit: () => fake.process.exited,
      }
    }

    const agentSettingsRepository = createAgentSettingsRepository(database, {
      validateExecutablePathFn: acceptTestExecutablePath,
    })
    const acpSupervisor = createAcpSupervisor({
      agentSettingsRepository,
      serverVersion: runtime.version,
      onSessionUpdate: (input) => {
        sessionUpdates.push(input)
      },
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
      sessionId: "sess_test",
      workspaceId: "ws_test",
    })
    expect(created.ok).toBe(true)
    if (!created.ok) {
      throw new Error("expected session creation to succeed")
    }

    const promptPromise = acpSupervisor.promptAcpSession({
      acpSessionId: created.acpSessionId,
      prompt: [{ type: "text", text: "hello" }],
    })

    await waitFor(() => sessionUpdates.length >= 1)
    const cancelResult = await acpSupervisor.cancelAcpSession({
      acpSessionId: created.acpSessionId,
    })
    expect(cancelResult).toEqual({ ok: true })

    const promptResult = await promptPromise
    expect(promptResult).toEqual({ ok: true, result: { stopReason: "cancelled" } })

    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(sessionUpdates).toHaveLength(1)
    expect(sessionUpdates[0]).toEqual({
      agentId: "cursor",
      acpSessionId: created.acpSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      },
    })

    await app.close()
    database.close()
  }, { timeout: 20_000 })
})
