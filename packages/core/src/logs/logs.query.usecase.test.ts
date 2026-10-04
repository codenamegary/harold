import { describe, expect, test } from "bun:test"
import { LogRecord } from "contracts/http/logs"
import { makeQueryLogs } from "./logs.query.usecase"

const record = (overrides: Partial<LogRecord> & { id: string }): LogRecord => ({
  ts: "2026-08-17T20:00:00.000Z",
  level: "info",
  source: "server",
  message: overrides.id,
  ...overrides,
})

const serverInfo = (id: string) => record({ id })

describe("makeQueryLogs", () => {
  test("returns the newest matches newest first with the total count", () => {
    const queryLogs = makeQueryLogs({
      getLogRecords: () => [
        serverInfo("one"),
        serverInfo("two"),
        record({ id: "three", level: "warn", source: "agent", agentId: "cursor" }),
      ],
    })

    const result = queryLogs({ limit: 2 })

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          record({ id: "three", level: "warn", source: "agent", agentId: "cursor" }),
          serverInfo("two"),
        ],
        count: 3,
        limit: 2,
      },
    })
  })

  test("filters by min level, source, and agent id", () => {
    const queryLogs = makeQueryLogs({
      getLogRecords: () => [
        serverInfo("server-info"),
        record({ id: "cursor-warn", level: "warn", source: "agent", agentId: "cursor" }),
        record({ id: "claude-error", level: "error", source: "agent", agentId: "claude-acp" }),
      ],
    })

    expect(queryLogs({ limit: 10, level: "warn" }).ok).toBe(true)
    if (queryLogs({ limit: 10, level: "warn" }).ok) {
      expect(queryLogs({ limit: 10, level: "warn" }).value.items.map((r) => r.id)).toEqual([
        "claude-error",
        "cursor-warn",
      ])
    }
    const filtered = queryLogs({ limit: 10, source: "agent", agentId: "cursor" })
    expect(filtered.ok).toBe(true)
    if (filtered.ok) {
      expect(filtered.value.items.map((r) => r.id)).toEqual(["cursor-warn"])
    }
  })

  test("returns an empty page when nothing matches", () => {
    const queryLogs = makeQueryLogs({ getLogRecords: () => [serverInfo("one")] })

    const result = queryLogs({ limit: 10, source: "agent" })

    expect(result).toEqual({
      ok: true,
      value: { items: [], count: 0, limit: 10 },
    })
  })

  test("rejects a non-positive limit", () => {
    const queryLogs = makeQueryLogs({
      getLogRecords: () => {
        throw new Error("getLogRecords should not run for an invalid limit")
      },
    })

    const result = queryLogs({ limit: 0 })

    expect(result).toEqual({
      ok: false,
      error: { kind: "INVALID_LIMIT", limit: 0 },
    })
  })

  test("rejects a non-integer limit", () => {
    const queryLogs = makeQueryLogs({
      getLogRecords: () => {
        throw new Error("getLogRecords should not run for an invalid limit")
      },
    })

    const result = queryLogs({ limit: 1.5 })

    expect(result).toEqual({
      ok: false,
      error: { kind: "INVALID_LIMIT", limit: 1.5 },
    })
  })
})
