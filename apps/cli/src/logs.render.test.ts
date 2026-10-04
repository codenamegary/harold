import { describe, expect, test } from "bun:test"
import { LogTailEntry, LogTailReadError } from "core/logs/tail.models"
import {
  renderLogEntries,
  renderLogEntryJson,
  renderLogEntryPlain,
  renderLogReadError,
} from "./logs.render"

const entry: LogTailEntry = {
  raw: '{"level":30,"time":1760000000000,"msg":"listening"}',
  record: {
    ts: "2025-10-01T00:00:00.000Z",
    level: "info",
    source: "server",
    message: "listening",
  },
}

describe("renderLogEntryPlain", () => {
  test("formats timestamp, level, source, and message", () => {
    expect(renderLogEntryPlain(entry)).toBe("2025-10-01T00:00:00.000Z INFO  server listening")
  })

  test("includes the agent id when present", () => {
    const withAgent: LogTailEntry = {
      ...entry,
      record: { ...entry.record, agentId: "cursor" },
    }

    expect(renderLogEntryPlain(withAgent)).toContain("[cursor]")
  })
})

describe("renderLogEntryJson", () => {
  test("serializes the parsed record", () => {
    expect(renderLogEntryJson(entry)).toBe(JSON.stringify(entry.record))
  })
})

describe("renderLogEntries", () => {
  test("joins plain entries with newlines", () => {
    expect(renderLogEntries([entry, entry], false)).toBe(
      `${renderLogEntryPlain(entry)}\n${renderLogEntryPlain(entry)}`,
    )
  })

  test("joins JSON entries with newlines", () => {
    expect(renderLogEntries([entry], true)).toBe(JSON.stringify(entry.record))
  })
})

describe("renderLogReadError", () => {
  test("explains a missing log file", () => {
    expect(renderLogReadError({ kind: "log_file_missing" })).toContain("harold serve")
  })

  test("explains an invalid line count", () => {
    expect(renderLogReadError({ kind: "invalid_lines", lines: 0 })).toContain("0")
  })

  test("explains a read failure with the detail", () => {
    const error: LogTailReadError = { kind: "log_file_read_failed", detail: "EACCES" }

    expect(renderLogReadError(error)).toContain("EACCES")
  })
})
