import { describe, expect, test } from "bun:test"
import { makeFollowLogs, makeTailLogs, selectLogEntries, toLogTailEntry } from "./logs.tail.usecase"

const pinoLine = (message: string, level: number): string =>
  JSON.stringify({ level, time: 1760000000000, msg: message })

describe("toLogTailEntry", () => {
  test("keeps the raw line next to its parsed record", () => {
    const raw = pinoLine("listening", 30)

    const entry = toLogTailEntry(raw)

    expect(entry.raw).toBe(raw)
    expect(entry.record).toMatchObject({ level: "info", source: "server", message: "listening" })
  })
})

describe("selectLogEntries", () => {
  test("skips blank lines", () => {
    const entries = selectLogEntries([pinoLine("one", 30), "", "   "])

    expect(entries).toHaveLength(1)
    expect(entries[0]?.record.message).toBe("one")
  })

  test("treats a non-JSON line as an info record with the raw text", () => {
    const entries = selectLogEntries(["agent crashed hard"])

    expect(entries[0]?.record).toMatchObject({ level: "info", message: "agent crashed hard" })
  })

  test("keeps entries at or above the minimum level", () => {
    const entries = selectLogEntries(
      [pinoLine("info-line", 30), pinoLine("warn-line", 40), pinoLine("debug-line", 20)],
      "warn",
    )

    expect(entries.map((entry) => entry.record.message)).toEqual(["warn-line"])
  })

  test("keeps every entry without a level filter", () => {
    const entries = selectLogEntries([pinoLine("a", 30), pinoLine("b", 60)])

    expect(entries).toHaveLength(2)
  })
})

describe("makeTailLogs", () => {
  test("returns parsed entries for the lines the reader produced", () => {
    const tailLogs = makeTailLogs({
      readTailLines: () => ({
        ok: true,
        lines: [pinoLine("first", 30), pinoLine("second", 40)],
      }),
    })

    const result = tailLogs({ path: "/data/harold.log", lines: 100 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries.map((entry) => entry.record.message)).toEqual(["first", "second"])
    }
  })

  test("applies the level filter to the read lines", () => {
    const tailLogs = makeTailLogs({
      readTailLines: () => ({ ok: true, lines: [pinoLine("info", 30), pinoLine("error", 50)] }),
    })

    const result = tailLogs({ path: "/data/harold.log", lines: 100, level: "error" })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries.map((entry) => entry.record.message)).toEqual(["error"])
    }
  })

  test("rejects a non-positive line count", () => {
    const tailLogs = makeTailLogs({
      readTailLines: () => ({ ok: true, lines: [] }),
    })

    const result = tailLogs({ path: "/data/harold.log", lines: 0 })

    expect(result).toEqual({ ok: false, error: { kind: "invalid_lines", lines: 0 } })
  })

  test("maps reader errors through", () => {
    const tailLogs = makeTailLogs({
      readTailLines: () => ({ ok: false, error: { kind: "log_file_missing" } }),
    })

    const result = tailLogs({ path: "/data/harold.log", lines: 100 })

    expect(result).toEqual({ ok: false, error: { kind: "log_file_missing" } })
  })
})

describe("makeFollowLogs", () => {
  test("filters batches and forwards non-empty entry batches", () => {
    const batches: Array<Array<string>> = []
    const followLogs = makeFollowLogs({
      followAppends: ({ onLines }) => {
        onLines([pinoLine("info", 30), pinoLine("warn", 40)])
        onLines([""])
        return () => {}
      },
    })

    const stop = followLogs({
      path: "/data/harold.log",
      level: "warn",
      onEntries: (entries) => {
        batches.push(entries.map((entry) => entry.record.message))
      },
    })

    expect(batches).toEqual([["warn"]])
    stop()
  })

  test("returns the adapter's stop handle", () => {
    let stopped = false
    const followLogs = makeFollowLogs({
      followAppends: () => () => {
        stopped = true
      },
    })

    const stop = followLogs({ path: "/data/harold.log", onEntries: () => {} })

    stop()

    expect(stopped).toBe(true)
  })
})
