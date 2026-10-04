import { describe, expect, test } from "bun:test"
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  daemonLogFilePath,
  makeNodeLogTailReader,
  resolveDaemonLogPath,
} from "./logs.tail.node.adapters"

const makeDataDir = (): string => mkdtempSync(path.join(tmpdir(), "harold-log-tail-"))

const pinoLine = (message: string): string =>
  JSON.stringify({ level: 30, time: 1760000000000, msg: message })

const waitFor = async (predicate: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for the log tail reader")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe("daemon log path", () => {
  test("defaults to harold.log under the data dir", () => {
    expect(daemonLogFilePath("/data")).toBe(path.join("/data", "harold.log"))
  })

  test("prefers the persisted log path over the default", () => {
    expect(resolveDaemonLogPath("/var/log/harold.log", "/data")).toBe("/var/log/harold.log")
    expect(resolveDaemonLogPath(null, "/data")).toBe(daemonLogFilePath("/data"))
  })
})

describe("node log tail reader", () => {
  test("reads only the last requested lines", () => {
    const dataDir = makeDataDir()
    const logPath = daemonLogFilePath(dataDir)
    writeFileSync(logPath, [1, 2, 3, 4, 5].map((n) => pinoLine(`line-${n}`)).join("\n"))

    const reader = makeNodeLogTailReader()

    const result = reader.readTailLines({ path: logPath, lines: 2 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.lines.map((line) => JSON.parse(line).msg)).toEqual(["line-4", "line-5"])
    }
    rmSync(dataDir, { recursive: true, force: true })
  })

  test("reads the whole file when it has fewer lines than requested", () => {
    const dataDir = makeDataDir()
    const logPath = daemonLogFilePath(dataDir)
    writeFileSync(logPath, `${pinoLine("only")}\n`)

    const reader = makeNodeLogTailReader()

    const result = reader.readTailLines({ path: logPath, lines: 50 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.lines).toHaveLength(1)
    }
    rmSync(dataDir, { recursive: true, force: true })
  })

  test("includes a final line without a trailing newline", () => {
    const dataDir = makeDataDir()
    const logPath = daemonLogFilePath(dataDir)
    writeFileSync(logPath, `${pinoLine("one")}\n${pinoLine("two")}`)

    const reader = makeNodeLogTailReader()

    const result = reader.readTailLines({ path: logPath, lines: 5 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.lines).toHaveLength(2)
    }
    rmSync(dataDir, { recursive: true, force: true })
  })

  test("reports a missing log file", () => {
    const dataDir = makeDataDir()
    const reader = makeNodeLogTailReader()

    const result = reader.readTailLines({ path: daemonLogFilePath(dataDir), lines: 10 })

    expect(result).toEqual({ ok: false, error: { kind: "log_file_missing" } })
    rmSync(dataDir, { recursive: true, force: true })
  })

  test("follows appends and only emits complete lines", async () => {
    const dataDir = makeDataDir()
    const logPath = daemonLogFilePath(dataDir)
    writeFileSync(logPath, `${pinoLine("initial")}\n`)

    const reader = makeNodeLogTailReader({ pollIntervalMs: 5 })
    const batches: Array<Array<string>> = []
    const stop = reader.followAppends({
      path: logPath,
      onLines: (lines) => {
        batches.push(lines)
      },
    })

    try {
      appendFileSync(logPath, pinoLine("partial"))
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(batches).toEqual([])
      appendFileSync(logPath, "-tail\n")
      const completedLine = `${pinoLine("partial")}-tail`
      await waitFor(() => batches.some((lines) => lines.includes(completedLine)))

      expect(batches.flat()).toEqual([completedLine])
    } finally {
      stop()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  test("waits for the log file to appear before following", async () => {
    const dataDir = makeDataDir()
    const logPath = daemonLogFilePath(dataDir)

    const reader = makeNodeLogTailReader({ pollIntervalMs: 5 })
    const batches: Array<Array<string>> = []
    const stop = reader.followAppends({
      path: logPath,
      onLines: (lines) => {
        batches.push(lines)
      },
    })

    try {
      writeFileSync(logPath, `${pinoLine("appears")}\n`)
      await waitFor(() => batches.length > 0)

      expect(batches.flat()).toEqual([pinoLine("appears")])
    } finally {
      stop()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  test("resets after the file is truncated", async () => {
    const dataDir = makeDataDir()
    const logPath = daemonLogFilePath(dataDir)
    writeFileSync(logPath, `${pinoLine("old-one")}\n${pinoLine("old-two")}\n`)

    const reader = makeNodeLogTailReader({ pollIntervalMs: 5 })
    const batches: Array<Array<string>> = []
    const stop = reader.followAppends({
      path: logPath,
      onLines: (lines) => {
        batches.push(lines)
      },
    })

    try {
      writeFileSync(logPath, `${pinoLine("fresh")}\n`)
      await waitFor(() => batches.flat().includes(pinoLine("fresh")))

      expect(batches.flat()).toEqual([pinoLine("fresh")])
    } finally {
      stop()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
