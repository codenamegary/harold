import { describe, expect, test } from "bun:test"
import { makeInMemoryLogStore } from "./logs.buffer.adapters"

const infoLine = (message: string, idSuffix?: string) => ({
  ts: "2026-08-17T20:00:00.000Z",
  level: "info" as const,
  source: "server" as const,
  message: idSuffix === undefined ? message : `${message}-${idSuffix}`,
})

describe("makeInMemoryLogStore", () => {
  test("append assigns sequential ids and exposes records for querying", () => {
    const store = makeInMemoryLogStore()
    const first = store.appendLog(infoLine("one"))
    const second = store.appendLog(infoLine("two"))

    expect(first.id).toBe("1")
    expect(second.id).toBe("2")
    expect(store.getLogRecords().map((record) => record.id)).toEqual(["1", "2"])
  })

  test("drops the oldest lines when over capacity", () => {
    const store = makeInMemoryLogStore(2)
    store.appendLog(infoLine("keep", "a"))
    store.appendLog(infoLine("keep", "b"))
    store.appendLog(infoLine("keep", "c"))

    expect(store.getLogRecords().map((record) => record.message)).toEqual(["keep-b", "keep-c"])
  })

  test("clear removes every line", () => {
    const store = makeInMemoryLogStore()
    store.appendLog(infoLine("gone"))
    store.clearLogs()

    expect(store.getLogRecords()).toEqual([])
  })
})
