import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { DaemonState, DaemonStateSchema } from "core/daemon-state/models"
import { makeBunSpawnBackgroundDaemon, makeStartBackgroundDaemon } from "./daemon.background"

const daemonState = (pid: number): DaemonState =>
  DaemonStateSchema.parse({
    pid,
    writtenAt: "2026-01-01T00:00:00.000Z",
    status: {
      version: "1.0.0",
      state: "online",
      bindAddress: "127.0.0.1",
      port: 3847,
      startedAt: "2026-01-01T00:00:00.000Z",
      acp: { state: "ready", activeSessions: 0 },
    },
  })

const neverExits = new Promise<number>(() => undefined)

describe("makeStartBackgroundDaemon", () => {
  test("resolves once the state file reports the spawned pid", async () => {
    const start = makeStartBackgroundDaemon({
      spawn: () => ({ pid: 5001, exited: neverExits, kill: () => undefined }),
      readLiveDaemonState: () => ({ ok: true, state: daemonState(5001) }),
      now: () => 0,
      sleep: async () => {
        throw new Error("readiness must not poll when the child is already live")
      },
    })

    const result = await start()

    expect(result).toEqual({ ok: true, value: { pid: 5001 } })
  })

  test("keeps waiting while the state file names a different daemon pid", async () => {
    const states = [daemonState(9999), daemonState(9999), daemonState(5001)]
    let reads = 0
    let clock = 0
    const start = makeStartBackgroundDaemon({
      spawn: () => ({ pid: 5001, exited: neverExits, kill: () => undefined }),
      readLiveDaemonState: () => {
        const state = states[Math.min(reads, states.length - 1)] ?? daemonState(9999)
        reads += 1
        return { ok: true, state }
      },
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
      pollIntervalMs: 100,
      timeoutMs: 1_000,
    })

    const result = await start()

    expect(result).toEqual({ ok: true, value: { pid: 5001 } })
    expect(clock).toBeGreaterThanOrEqual(100)
  })

  test("fails when the child exits before the state file names it", async () => {
    const start = makeStartBackgroundDaemon({
      spawn: () => ({ pid: 5001, exited: Promise.resolve(1), kill: () => undefined }),
      readLiveDaemonState: () => ({ ok: false, error: { kind: "no_state_file" } }),
      now: () => 0,
      sleep: () => new Promise(() => undefined),
    })

    const result = await start()

    expect(result).toEqual({ ok: false, error: { kind: "daemon_exited", code: 1 } })
  })

  test("fails when the child does not become ready before the deadline", async () => {
    let clock = 0
    let kills = 0
    const start = makeStartBackgroundDaemon({
      spawn: () => ({
        pid: 5001,
        exited: neverExits,
        kill: () => {
          kills += 1
        },
      }),
      readLiveDaemonState: () => ({ ok: false, error: { kind: "no_state_file" } }),
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
      pollIntervalMs: 100,
      timeoutMs: 250,
    })

    const result = await start()

    expect(result).toEqual({ ok: false, error: { kind: "timed_out" } })
    expect(kills).toBe(1)
  })
})

describe("makeBunSpawnBackgroundDaemon", () => {
  test("spawns the entry with serve and passes the provided env", async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "harold-spawn-"))
    const recordPath = path.join(scratch, "child.json")
    const entry = path.join(scratch, "child.ts")
    writeFileSync(
      entry,
      [
        'import { writeFileSync } from "node:fs"',
        "writeFileSync(",
        "  process.env.HAROLD_SPAWN_RECORD ?? '',",
        "  JSON.stringify({ argv: process.argv.slice(1), probe: process.env.HAROLD_SPAWN_PROBE }),",
        ")",
      ].join("\n"),
    )

    try {
      const spawn = makeBunSpawnBackgroundDaemon({
        execPath: process.execPath,
        entry,
        env: { ...process.env, HAROLD_SPAWN_RECORD: recordPath, HAROLD_SPAWN_PROBE: "kept" },
      })

      const child = spawn()
      await child.exited

      const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
        argv: string[]
        probe: string
      }
      expect(record.argv).toEqual([entry, "serve"])
      expect(record.probe).toBe("kept")
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
