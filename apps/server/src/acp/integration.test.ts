import { describe, expect, test } from "bun:test"
import { StatusSchema } from "contracts/http/status"
import { spawnFakeAcp } from "test-support/spawn"
import { bootTestApp } from "../test-support/test.harness"
import { SpawnedAgentProcess } from "./supervisor/models"
import { makeUpdateAgentSettingsRow } from "../agent-settings/agent.settings.sqlite.adapters"
import {
  inventoryAdvertisesResumable,
  inventoryAdvertisesSessionClose,
  inventoryAdvertisesSessionList,
} from "./agent/inventory"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

type SpawnedFakeAcpHandle = ReturnType<typeof spawnFakeAcp>

const createFakeSpawnFn = () => {
  const spawned: SpawnedFakeAcpHandle[] = []
  const killed = { value: false }
  const spawnAgentProcessFn = (): SpawnedAgentProcess => {
    const fake = spawnFakeAcp()
    spawned.push(fake)
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

describe("ACP supervisor integration", () => {
  test("status reports ready after supervisor start with fake ACP", async () => {
    const { spawnAgentProcessFn } = createFakeSpawnFn()
    const { app, acpSupervisor } = await bootTestApp({
      spawnAgentProcessFn,
      config: { host: "127.0.0.1", port: 3848 },
    })

    const enableResponse = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: "/fake/agent" },
    })
    expect(enableResponse.statusCode).toBe(200)

    await acpSupervisor.start("cursor")

    const statusResponse = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/status",
    })
    const status = StatusSchema.parse(JSON.parse(statusResponse.body))

    expect(status.acp).toEqual({ state: "ready", activeSessions: 0 })
    const inventory = acpSupervisor.getCapabilityInventory("cursor")
    expect(inventoryAdvertisesResumable(inventory)).toBe(false)
    expect(inventoryAdvertisesSessionClose(inventory)).toBe(false)
    expect(inventoryAdvertisesSessionList(inventory)).toBe(true)
  })

  test("status stays stopped when start is called for a disabled agent", async () => {
    const { spawnAgentProcessFn } = createFakeSpawnFn()
    const { app, acpSupervisor } = await bootTestApp({
      spawnAgentProcessFn,
      config: { host: "127.0.0.1", port: 3848 },
    })

    expect(await acpSupervisor.start("cursor")).toEqual({
      ok: false,
      reason: "Agent is not enabled",
    })

    const statusResponse = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/status",
    })
    const status = StatusSchema.parse(JSON.parse(statusResponse.body))
    expect(status.acp.state).toBe("stopped")
  })

  test(
    "disabling a running agent stops the supervisor",
    async () => {
      const { spawnAgentProcessFn } = createFakeSpawnFn()
      const { app, acpSupervisor } = await bootTestApp({
        spawnAgentProcessFn,
        config: { host: "127.0.0.1", port: 3848 },
      })

      await app.inject({
        headers: authHeaders(app),
        method: "PATCH",
        url: "/v1/settings/agents/cursor",
        payload: { enabled: true, path: "/fake/agent" },
      })
      await acpSupervisor.start("cursor")
      expect(acpSupervisor.getStatus().state).toBe("ready")

      await app.inject({
        headers: authHeaders(app),
        method: "PATCH",
        url: "/v1/settings/agents/cursor",
        payload: { enabled: false },
      })

      expect(acpSupervisor.getStatus().state).toBe("stopped")

      const statusResponse = await app.inject({
        headers: authHeaders(app),
        method: "GET",
        url: "/v1/status",
      })
      const status = StatusSchema.parse(JSON.parse(statusResponse.body))
      expect(status.acp.state).toBe("stopped")
    },
    { timeout: 20_000 },
  )

  test(
    "PATCH enable starts the supervisor",
    async () => {
      const { spawnAgentProcessFn } = createFakeSpawnFn()
      const { app, acpSupervisor } = await bootTestApp({
        spawnAgentProcessFn,
        config: { host: "127.0.0.1", port: 3848 },
      })

      const enableResponse = await app.inject({
        headers: authHeaders(app),
        method: "PATCH",
        url: "/v1/settings/agents/cursor",
        payload: { enabled: true, path: "/fake/agent" },
      })
      expect(enableResponse.statusCode).toBe(200)
      expect(acpSupervisor.getStatus().state).toBe("ready")
      expect(acpSupervisor.getRunningAgentIds()).toEqual(["cursor"])

      const statusResponse = await app.inject({
        headers: authHeaders(app),
        method: "GET",
        url: "/v1/status",
      })
      const status = StatusSchema.parse(JSON.parse(statusResponse.body))
      expect(status.acp.state).toBe("ready")
    },
    { timeout: 20_000 },
  )

  test("shutdown stops the ACP child before the database closes", async () => {
    const { spawnAgentProcessFn, killed } = createFakeSpawnFn()
    const { app, acpSupervisor, database, runtime } = await bootTestApp({
      spawnAgentProcessFn,
      config: { host: "127.0.0.1", port: 3848 },
    })

    await app.inject({
      headers: authHeaders(app),
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
    expect(() => database.sqlite.query("SELECT 1").get()).not.toThrow()
  })

  test("createServer starts agents that were left enabled in the database", async () => {
    const { spawnAgentProcessFn, spawned } = createFakeSpawnFn()
    const { app, acpSupervisor } = await bootTestApp({
      spawnAgentProcessFn,
      config: { host: "127.0.0.1", port: 3848 },
      setup: ({ database }) => {
        makeUpdateAgentSettingsRow(database)({
          agentId: "cursor",
          patch: { enabled: true, path: "/fake/agent" },
        })
      },
    })

    expect(acpSupervisor.getRunningAgentIds()).toEqual(["cursor"])
    expect(acpSupervisor.getStatus().state).toBe("ready")
    expect(spawned).toHaveLength(1)

    const listResponse = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/sessions",
    })
    expect(listResponse.statusCode).toBe(200)
  })
})
