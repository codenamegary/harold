import { describe, expect, test } from "bun:test"
import { makeServeCommand, ServeDeps } from "./serve.command"

const makeDeps = (overrides: Partial<ServeDeps> = {}) => {
  const order: string[] = []
  const warnings: string[] = []
  const infos: string[] = []

  const deps: ServeDeps = {
    dataDir: "/home/dev/.harold",
    readLiveDaemonState: () => ({ ok: false, error: { kind: "no_state_file" } }),
    isFreshInstall: () => true,
    isInteractive: () => true,
    runServer: async () => {
      order.push("serve")
    },
    runSetup: async () => {
      order.push("setup")
      return 0
    },
    writeWarn: (message) => {
      warnings.push(message)
    },
    writeInfo: (message) => {
      infos.push(message)
    },
    ...overrides,
  }

  return { deps, order, warnings, infos }
}

const run = async (deps: ServeDeps, args: readonly string[] = []): Promise<number | undefined> => {
  process.exitCode = undefined
  await makeServeCommand(deps).parseAsync([...args], { from: "user" })
  return process.exitCode
}

describe("harold serve", () => {
  test("runs setup after the listener is up on a fresh interactive install", async () => {
    const harness = makeDeps()

    const exitCode = await run(harness.deps)

    expect(exitCode).toBe(0)
    expect(harness.order).toEqual(["serve", "setup"])
  })

  test("skips setup when the data dir is not fresh", async () => {
    const harness = makeDeps({ isFreshInstall: () => false })

    const exitCode = await run(harness.deps)

    expect(exitCode).toBe(0)
    expect(harness.order).toEqual(["serve"])
  })

  test("skips setup without a terminal and points at harold setup", async () => {
    const harness = makeDeps({ isInteractive: () => false })

    const exitCode = await run(harness.deps)

    expect(exitCode).toBe(0)
    expect(harness.order).toEqual(["serve"])
    expect(harness.warnings.join("\n")).toContain("Fresh install")
    expect(harness.infos.join("\n")).toContain("harold setup")
  })

  test("exits 1 without serving when a daemon is already running", async () => {
    const harness = makeDeps({
      readLiveDaemonState: () => ({
        ok: true,
        state: {
          pid: 4321,
          writtenAt: "2026-10-04T00:00:00.000Z",
          status: {
            version: "0.2.1",
            state: "online",
            bindAddress: "127.0.0.1",
            port: 3847,
            startedAt: "2026-10-04T00:00:00.000Z",
            acp: { state: "ready", activeSessions: 0 },
          },
        },
      }),
    })

    const exitCode = await run(harness.deps)

    expect(exitCode).toBe(1)
    expect(harness.order).toEqual([])
    expect(harness.warnings.join("\n")).toContain("4321")
  })
})
