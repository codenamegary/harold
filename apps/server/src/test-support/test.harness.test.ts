import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import {
  bootTestApp,
  bootTestDatabase,
  disposeTestResources,
  registerTestApp,
  registerTestChild,
  registerTestCleanup,
} from "./test.harness"
import Fastify from "fastify"
import { createAcpSupervisor } from "../acp/supervisor/supervisor"
import { createAgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { seedWorkspace } from "./test.app"

test("boots an isolated Agent Server with a working Device API", async () => {
  const first = await bootTestApp()
  const second = await bootTestApp()
  expect(first.dataDir).not.toBe(second.dataDir)
  expect(first.database).not.toBe(second.database)
  expect((await first.app.inject({ method: "GET", url: "/v1/workspaces" })).statusCode).toBe(200)
  expect((await second.app.inject({ method: "GET", url: "/v1/workspaces" })).statusCode).toBe(200)
  await disposeTestResources()
})

test("cleanup stops ACP before apps, keeps SQLite open for app hooks, and awaits children before removing directories", async () => {
  const order: string[] = []
  const result = await bootTestApp({
    config: { port: 4321 },
    registerTestRoutes: true,
    setup: ({ database, runtime }) => {
      const supervisor = createAcpSupervisor({
        agentSettingsRepository: createAgentSettingsRepository(database),
        serverVersion: runtime.version,
      })
      return {
        acpSupervisor: {
          ...supervisor,
          stop: async () => {
            order.push("ACP")
            await supervisor.stop()
          },
        },
      }
    },
  })
  result.app.addHook("onClose", async () => {
    expect(result.database.sqlite.query("SELECT 1 AS value").get()).toEqual({ value: 1 })
    order.push("app")
  })
  const probe = registerTestApp(Fastify())
  probe.addHook("onClose", async () => {
    order.push("probe")
  })
  registerTestChild({
    kill: () => {
      expect(() => result.database.sqlite.query("SELECT 1").get()).toThrow()
      order.push("kill")
    },
    waitForExit: async () => {
      await Bun.sleep(10)
      expect(existsSync(result.dataDir)).toBe(true)
      order.push("exit")
      return 0
    },
  })
  expect(result.config.port).toBe(4321)
  expect(
    (
      await result.app.inject({
        method: "POST",
        url: "/v1/_test/validate",
        payload: { name: "test" },
      })
    ).statusCode,
  ).toBe(200)
  await disposeTestResources()
  expect(order[0]).toBe("ACP")
  expect(order.slice(1, 3).sort()).toEqual(["app", "probe"])
  expect(order.slice(3)).toEqual(["kill", "exit"])
  expect(existsSync(result.dataDir)).toBe(false)
})

test("cleanup aggregates failures, drains every phase, and waits for pending boot", async () => {
  const pending: Promise<Awaited<ReturnType<typeof bootTestApp>>> = bootTestApp()
  const failure = new Error("probe close failed")
  const exitFailure = new Error("child exit failed")
  const closed: string[] = []
  registerTestApp({
    close: async () => {
      throw failure
    },
  })
  registerTestChild({
    kill: () => {
      closed.push("kill")
    },
    waitForExit: async () => {
      throw exitFailure
    },
  })
  registerTestApp({
    close: async () => {
      closed.push("healthy probe")
    },
  })
  const disposal = disposeTestResources()
  const app = await pending
  const disposalError = await disposal.then(
    () => undefined,
    (error) => error,
  )
  expect(disposalError).toMatchObject({ errors: [failure, exitFailure] })
  expect(closed).toEqual(["healthy probe", "kill"])
  expect(() => app.database.sqlite.query("SELECT 1").get()).toThrow()
  expect(existsSync(app.dataDir)).toBe(false)
  await disposeTestResources()
})

test("failed setup immediately cleans acquired resources and preserves boot and cleanup errors", async () => {
  const bootFailure = new Error("setup failed")
  const paths: string[] = []
  const databases: Array<Awaited<ReturnType<typeof bootTestDatabase>>["database"]> = []
  const bootResult = await bootTestApp({
    setup: ({ database, dataDir }) => {
      paths.push(dataDir)
      databases.push(database)
      throw bootFailure
    },
  }).then(
    () => undefined,
    (error) => error,
  )
  expect(bootResult).toBe(bootFailure)
  expect(paths.every((dir) => !existsSync(dir))).toBe(true)
  expect(() => databases[0].sqlite.query("SELECT 1").get()).toThrow()
  await disposeTestResources()
})

test("reopens an app and database in their owned directories without losing data", async () => {
  const original = await bootTestApp()
  await seedWorkspace(original.app, original.dataDir)
  const reopened = await original.reopen()
  expect(reopened.dataDir).toBe(original.dataDir)
  expect(reopened.app).not.toBe(original.app)
  expect(() => original.database.sqlite.query("SELECT 1").get()).toThrow()
  const response = await reopened.app.inject({ method: "GET", url: "/v1/workspaces" })
  expect(response.body).toContain("Project")
  const first = await bootTestDatabase()
  first.database.sqlite.run("CREATE TABLE durability (value TEXT)")
  first.database.sqlite.run("INSERT INTO durability VALUES ('retained')")
  const next = await first.reopen()
  expect(next.dataDir).toBe(first.dataDir)
  expect(next.database.sqlite.query("SELECT value FROM durability").get()).toEqual({
    value: "retained",
  })
  expect(() => first.database.sqlite.query("SELECT 1").get()).toThrow()
  await disposeTestResources()
  expect(existsSync(first.dataDir)).toBe(false)
  expect(existsSync(original.dataDir)).toBe(false)
})

test("registered cleanup for raw handles runs on dispose and aggregates its failures", async () => {
  const calls: string[] = []
  registerTestCleanup(() => {
    calls.push("first")
  })
  registerTestCleanup(async () => {
    throw new Error("cleanup failed")
  })
  registerTestCleanup(() => {
    calls.push("last")
  })
  const disposalError = await disposeTestResources().then(
    () => undefined,
    (error) => error,
  )
  expect(disposalError).toMatchObject({ errors: [new Error("cleanup failed")] })
  expect(calls).toEqual(["first", "last"])
  await disposeTestResources()
  expect(calls).toEqual(["first", "last"])
})
