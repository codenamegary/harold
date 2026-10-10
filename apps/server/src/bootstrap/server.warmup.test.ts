import { eq } from "drizzle-orm"
import { afterEach, describe, expect, test } from "bun:test"
import { spawnFakeAcp, SpawnedFakeAcp } from "test-support/spawn"
import { agentSettings } from "../persistence/schema/agent-settings"
import { createRuntime } from "../runtime/runtime"
import { acceptTestExecutablePath } from "../test-support/test.app"
import { bootTestDatabase } from "../test-support/test.harness"
import { ConfigSchema, parseConfig } from "../config/config"
import { createServer } from "./server"

const spawnedFakes: SpawnedFakeAcp[] = []

afterEach(async () => {
  await Promise.all(
    spawnedFakes.splice(0).map(async (fake) => {
      fake.kill()
      await fake.process.exited
    }),
  )
})

describe("agent warm-up", () => {
  test("serves before enabled agents are spawned, then warms them on request", async () => {
    const { database, dataDir } = await bootTestDatabase()
    database.db
      .update(agentSettings)
      .set({ enabled: true, path: "/usr/local/bin/agent" })
      .where(eq(agentSettings.agentId, "cursor"))
      .run()

    const config = ConfigSchema.parse({
      ...parseConfig({ HAROLD_PORT: "0", HAROLD_DATA_DIR: dataDir }),
      dataDir,
    })

    const server = await createServer({
      config,
      database,
      runtime: createRuntime("0.1.0"),
      validateExecutablePathFn: acceptTestExecutablePath,
      spawnAgentProcessFn: () => {
        const fake = spawnFakeAcp()
        spawnedFakes.push(fake)
        return {
          stdin: fake.stdin,
          stdout: fake.stdout,
          kill: fake.kill,
          waitForExit: () => fake.process.exited,
        }
      },
    })

    try {
      expect(spawnedFakes).toHaveLength(0)
      expect(server.acpSupervisor.getStatus().state).toBe("stopped")

      await server.warmAgents()

      expect(spawnedFakes).toHaveLength(1)
      expect(server.acpSupervisor.getRunningAgentIds()).toEqual(["cursor"])
    } finally {
      await server.acpSupervisor.stop()
      await server.app.close()
    }
  })
})
