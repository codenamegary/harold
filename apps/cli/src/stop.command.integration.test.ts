import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { DaemonStateSchema } from "core/daemon-state/models"
import {
  daemonStateFilePath,
  makeDaemonStateFileStore,
  makeNodeProcessAlive,
  makeNodeRequestStop,
} from "core/daemon-state/node.adapters"
import { makeReadLiveDaemonState } from "core/daemon-state/read.live.usecase"
import { makeStopLiveDaemon } from "core/daemon-state/stop.usecase"
import { executeStop } from "./stop.command"

describe("harold stop against a real process", () => {
  test("stops the process named by the state file and exits 0", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "harold-stop-"))
    const child = Bun.spawn(["sleep", "30"], { stdio: ["ignore", "ignore", "ignore"] })
    const store = makeDaemonStateFileStore({ path: daemonStateFilePath(dataDir) })

    store.write(
      DaemonStateSchema.parse({
        pid: child.pid,
        writtenAt: new Date().toISOString(),
        status: {
          version: "1.0.0",
          state: "online",
          bindAddress: "127.0.0.1",
          port: 3847,
          startedAt: new Date().toISOString(),
          acp: { state: "ready", activeSessions: 0 },
        },
      }),
    )

    const out: string[] = []
    const err: string[] = []

    try {
      const exitCode = await executeStop({
        stopLiveDaemon: makeStopLiveDaemon({
          readLiveDaemonState: makeReadLiveDaemonState({
            readDaemonState: store.read,
            isProcessAlive: makeNodeProcessAlive(),
          }),
          requestStop: makeNodeRequestStop(),
          now: () => Date.now(),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          pollIntervalMs: 20,
          timeoutMs: 5_000,
        }),
        writeOut: (line) => out.push(line),
        writeErr: (line) => err.push(line),
      })

      expect(exitCode).toBe(0)
      expect(out.join("\n")).toContain(`Harold stopped (pid ${child.pid}).`)
      expect(err.join("\n")).toBe("")

      const exitCodeOfChild = await child.exited
      expect(exitCodeOfChild).not.toBe(0)
      expect(makeNodeProcessAlive()(child.pid)).toBe(false)
    } finally {
      child.kill()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
