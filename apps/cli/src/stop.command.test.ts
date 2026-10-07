import { describe, expect, test } from "bun:test"
import { StopLiveDaemonResult } from "core/daemon-state/stop.usecase"
import { makeStopCommand } from "./stop.command"

const run = async (result: StopLiveDaemonResult) => {
  const out: string[] = []
  const err: string[] = []
  process.exitCode = 0

  await makeStopCommand({
    stopLiveDaemon: async () => result,
    writeOut: (line) => out.push(line),
    writeErr: (line) => err.push(line),
  }).parseAsync([], { from: "user" })

  return { out: out.join("\n"), err: err.join("\n"), exitCode: process.exitCode }
}

describe("harold stop", () => {
  test("reports the stopped daemon pid and exits 0", async () => {
    const result = await run({ ok: true, value: { pid: 4321 } })

    expect(result.out).toContain("Harold stopped (pid 4321).")
    expect(result.err).toBe("")
    expect(result.exitCode).toBe(0)
  })

  test("is idempotent when no daemon is running", async () => {
    const result = await run({ ok: false, error: { kind: "not_running" } })

    expect(result.out).toContain("Harold is not running.")
    expect(result.err).toBe("")
    expect(result.exitCode).toBe(0)
  })

  test("refuses a stale heartbeat without signaling", async () => {
    const result = await run({
      ok: false,
      error: { kind: "stale_heartbeat", pid: 4321, ageMs: 12_000 },
    })

    expect(result.err).toContain("Refusing to stop pid 4321")
    expect(result.exitCode).toBe(1)
  })

  test("reports a daemon that did not stop", async () => {
    const result = await run({ ok: false, error: { kind: "timeout", pid: 4321 } })

    expect(result.err).toContain("Harold did not stop (pid 4321).")
    expect(result.exitCode).toBe(1)
  })
})
