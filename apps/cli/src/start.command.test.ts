import { describe, expect, test } from "bun:test"
import { StatusSummary } from "core/status/summary.models"
import { renderStartDaemonError } from "./daemon.background"
import { makeStartCommand, StartDeps } from "./start.command"
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

const runningDaemon = {
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
} as const

const makeDeps = (overrides: Partial<StartDeps> = {}) => {
  const order: string[] = []
  const output: string[] = []
  const errors: string[] = []

  const deps: StartDeps = {
    readLiveDaemonState: () => ({ ok: false, error: { kind: "no_state_file" } }),
    startDaemon: async () => {
      order.push("startDaemon")
      return { ok: true, value: { pid: 4321 } }
    },
    renderStartError: (error) => `rendered:${error.kind}`,
    readRunningView: () => view(),
    writeOut: (line) => output.push(line),
    writeErr: (line) => errors.push(line),
    colors: { bold: (text) => text, dim: (text) => text },
    ...overrides,
  }

  return { deps, order, output, errors }
}

const run = async (deps: StartDeps): Promise<number | undefined> => {
  process.exitCode = 0
  await makeStartCommand(deps).parseAsync([], { from: "user" })
  return process.exitCode
}

describe("harold start", () => {
  test("prints already running with the status and exits 0 without starting a daemon", async () => {
    const harness = makeDeps({
      readLiveDaemonState: () => runningDaemon,
      startDaemon: async () => {
        throw new Error("start must not spawn when a daemon is already running")
      },
      readRunningView: () => view(),
    })

    const exitCode = await run(harness.deps)
    const output = harness.output.join("\n")

    expect(exitCode).toBe(0)
    expect(harness.order).toEqual([])
    expect(output).toContain("already running")
    expect(output).toContain("(pid 4321)")
    expect(output).toContain("http://127.0.0.1:3847")
  })

  test("spawns the daemon once and prints the running view with the next step", async () => {
    const harness = makeDeps({ readRunningView: () => view({}, 0) })

    const exitCode = await run(harness.deps)
    const output = harness.output.join("\n")

    expect(exitCode).toBe(0)
    expect(harness.order).toEqual(["startDaemon"])
    expect(harness.errors).toEqual([])
    expect(output).toContain("Harold is running")
    expect(output).toContain("http://127.0.0.1:3847")
    expect(output).toContain("harold pair")
  })

  test("fails when the daemon exits before it is ready", async () => {
    const harness = makeDeps({
      startDaemon: async () => ({ ok: false, error: { kind: "daemon_exited", code: 1 } }),
      renderStartError: (error) => renderStartDaemonError(error, 3847, "harold start"),
      readRunningView: () => {
        throw new Error("running view must not render when the daemon never started")
      },
    })

    const exitCode = await run(harness.deps)
    const errors = harness.errors.join("\n")

    expect(exitCode).toBe(1)
    expect(errors).toContain("exited before it was ready (exit code 1)")
    expect(errors).toContain("harold start")
  })

  test("fails when the daemon never becomes ready", async () => {
    const harness = makeDeps({
      startDaemon: async () => ({ ok: false, error: { kind: "timed_out" } }),
      renderStartError: (error) => renderStartDaemonError(error, 3847, "harold start"),
      readRunningView: () => {
        throw new Error("running view must not render when the daemon never started")
      },
    })

    const exitCode = await run(harness.deps)
    const errors = harness.errors.join("\n")

    expect(exitCode).toBe(1)
    expect(errors).toContain("Timed out waiting for Harold to start")
    expect(errors).toContain("harold start")
  })

  test("points a fresh install at harold setup", async () => {
    const harness = makeDeps({
      readRunningView: () => view({ agents: { enabled: 0, needsAuth: null }, workspaces: 0 }),
    })

    const exitCode = await run(harness.deps)
    const output = harness.output.join("\n")

    expect(exitCode).toBe(0)
    expect(output).toContain("harold setup")
  })
})
