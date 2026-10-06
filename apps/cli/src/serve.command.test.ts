import { describe, expect, test } from "bun:test"
import { StatusSummary } from "core/status/summary.models"
import { makeServeCommand, ServeDeps } from "./serve.command"
import { RunningView } from "./running.view"

const summary = (overrides: Partial<StatusSummary> = {}): StatusSummary => ({
  dataDir: "/home/dev/.harold",
  localApi: { host: "127.0.0.1", port: 3847 },
  advertisedEndpoint: { url: "https://harold.example.com", enabled: true },
  agents: { enabled: 2, needsAuth: 0 },
  workspaces: 1,
  ...overrides,
})

const view = (overrides: Partial<StatusSummary> = {}, devices = 1): RunningView => ({
  summary: summary(overrides),
  devices,
})

const makeDeps = (overrides: Partial<ServeDeps> = {}) => {
  const order: string[] = []
  const warnings: string[] = []
  const output: string[] = []

  const deps: ServeDeps = {
    readLiveDaemonState: () => ({ ok: false, error: { kind: "no_state_file" } }),
    runServer: async () => {
      order.push("serve")
    },
    readRunningView: () => view(),
    writeOut: (line) => {
      output.push(line)
    },
    writeWarn: (message) => {
      warnings.push(message)
    },
    colors: { bold: (text) => text, dim: (text) => text },
    ...overrides,
  }

  return { deps, order, warnings, output }
}

const run = async (deps: ServeDeps): Promise<number | undefined> => {
  process.exitCode = 0
  await makeServeCommand(deps).parseAsync([], { from: "user" })
  return process.exitCode
}

describe("harold serve", () => {
  test("prints the running view with the local API URL and next step", async () => {
    const harness = makeDeps({ readRunningView: () => view({}, 0) })

    const exitCode = await run(harness.deps)
    const output = harness.output.join("\n")

    expect(exitCode).toBe(0)
    expect(harness.order).toEqual(["serve"])
    expect(output).toContain("Harold is running")
    expect(output).toContain("http://127.0.0.1:3847")
    expect(output).toContain("harold pair")
  })

  test("points a fresh install at harold setup instead of running the wizard", async () => {
    const harness = makeDeps({
      readRunningView: () => view({ agents: { enabled: 0, needsAuth: null }, workspaces: 0 }),
    })

    const exitCode = await run(harness.deps)
    const output = harness.output.join("\n")

    expect(exitCode).toBe(0)
    expect(harness.order).toEqual(["serve"])
    expect(output).toContain("harold setup")
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
