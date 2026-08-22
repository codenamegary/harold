import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { StatusSchema } from "contracts/http/status"
import { spawnFakeAcp } from "test-support/spawn"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import { SpawnedAgentProcess } from "./supervisor/spawn-agent-process"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"
import { createAgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import {
  inventoryAdvertisesResumable,
  inventoryAdvertisesSessionClose,
  inventoryAdvertisesSessionList,
} from "./agent/inventory"

const tempDirs: string[] = []
const fakeProcesses: Array<{ kill: () => void }> = []

const acceptTestExecutablePath: ValidateExecutablePathFn = () => true

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-acp-integration-"))
  tempDirs.push(dir)
  return dir
}

const createFakeSpawnFn = () => {
  const spawned: Array<{ kill: () => void }> = []
  const killed = { value: false }
  const spawnAgentProcessFn = (): SpawnedAgentProcess => {
    const fake = spawnFakeAcp()
    spawned.push(fake)
    fakeProcesses.push(fake)
    return {
      stdin: fake.stdin,
      stdout: fake.stdout,
      kill: () => {
        killed.value = true
        fake.kill()
      },
      waitForExit: () => fake.process.exited,
    }
  }

  return { spawnAgentProcessFn, spawned, killed }
}

const createTestHarness = async () => {
  const dataDir = await createTempDataDir()
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "3848",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const { spawnAgentProcessFn } = createFakeSpawnFn()
  const server = await createServer({
    config,
    runtime,
    database,
    validateExecutablePathFn: acceptTestExecutablePath,
    spawnAgentProcessFn,
  })

  return { ...server, database, config, runtime }
}

afterEach(async () => {
  fakeProcesses.splice(0).forEach((process) => process.kill())
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("ACP supervisor integration", () => {
  test("status reports ready after supervisor start with fake ACP", async () => {
    const { app, acpSupervisor, database } = await createTestHarness()

    const enableResponse = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: "/fake/agent" },
    })
    expect(enableResponse.statusCode).toBe(200)

    await acpSupervisor.start("cursor")

    const statusResponse = await app.inject({ method: "GET", url: "/v1/status" })
    const status = StatusSchema.parse(JSON.parse(statusResponse.body))

    expect(status.acp).toEqual({ state: "ready", activeSessions: 0 })
    const inventory = acpSupervisor.getCapabilityInventory("cursor")
    expect(inventoryAdvertisesResumable(inventory)).toBe(false)
    expect(inventoryAdvertisesSessionClose(inventory)).toBe(false)
    expect(inventoryAdvertisesSessionList(inventory)).toBe(true)

    await acpSupervisor.stop()
        await app.close()
    database.close()
  })

  test("status stays stopped when start is called for a disabled agent", async () => {
    const { app, acpSupervisor, database } = await createTestHarness()

    await expect(acpSupervisor.start("cursor")).rejects.toThrow()

    const statusResponse = await app.inject({ method: "GET", url: "/v1/status" })
    const status = StatusSchema.parse(JSON.parse(statusResponse.body))
    expect(status.acp.state).toBe("stopped")

    await app.close()
    database.close()
  })

  test("disabling a running agent stops the supervisor", async () => {
    const { app, acpSupervisor, database } = await createTestHarness()

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: "/fake/agent" },
    })
    await acpSupervisor.start("cursor")
    expect(acpSupervisor.getStatus().state).toBe("ready")

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: false },
    })

    expect(acpSupervisor.getStatus().state).toBe("stopped")

    const statusResponse = await app.inject({ method: "GET", url: "/v1/status" })
    const status = StatusSchema.parse(JSON.parse(statusResponse.body))
    expect(status.acp.state).toBe("stopped")

    await acpSupervisor.stop()
    await app.close()
    database.close()
  })

  test("PATCH enable starts the supervisor", async () => {
    const { app, acpSupervisor, database } = await createTestHarness()

    const enableResponse = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: "/fake/agent" },
    })
    expect(enableResponse.statusCode).toBe(200)
    expect(acpSupervisor.getStatus().state).toBe("ready")
    expect(acpSupervisor.getRunningAgentIds()).toEqual(["cursor"])

    const statusResponse = await app.inject({ method: "GET", url: "/v1/status" })
    const status = StatusSchema.parse(JSON.parse(statusResponse.body))
    expect(status.acp.state).toBe("ready")

    await acpSupervisor.stop()
    await app.close()
    database.close()
  })

  test("shutdown stops the ACP child before the database closes", async () => {
    const { spawnAgentProcessFn, killed } = createFakeSpawnFn()
    const dataDir = await createTempDataDir()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "3848",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { app, acpSupervisor } = await createServer({
      config,
      runtime,
      database,
      validateExecutablePathFn: acceptTestExecutablePath,
      spawnAgentProcessFn,
    })

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: "/fake/agent" },
    })
    await acpSupervisor.start("cursor")
    expect(acpSupervisor.getStatus().state).toBe("ready")

    runtime.setState("shutting_down")
    await acpSupervisor.stop()
    expect(killed.value).toBe(true)
    expect(acpSupervisor.getStatus().state).toBe("stopped")

        await app.close()
    database.close()
  })

  test("createServer starts agents that were left enabled in the database", async () => {
    const dataDir = await createTempDataDir()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "3848",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { spawnAgentProcessFn, spawned } = createFakeSpawnFn()

    const seedRepository = createAgentSettingsRepository(database, {
      validateExecutablePathFn: acceptTestExecutablePath,
    })
    const seeded = seedRepository.update({
      agentId: "cursor",
      body: { enabled: true, path: "/fake/agent" },
    })
    expect(seeded.ok).toBe(true)

    const { app, acpSupervisor } = await createServer({
      config,
      runtime,
      database,
      validateExecutablePathFn: acceptTestExecutablePath,
      spawnAgentProcessFn,
    })

    expect(acpSupervisor.getRunningAgentIds()).toEqual(["cursor"])
    expect(acpSupervisor.getStatus().state).toBe("ready")
    expect(spawned).toHaveLength(1)

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions",
    })
    expect(listResponse.statusCode).toBe(200)

    await acpSupervisor.stop()
    await app.close()
    database.close()
  })
})
