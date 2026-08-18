import { describe, expect, test } from "bun:test"
import { createLogBuffer } from "./log.buffer"

const infoLine = (message: string, idSuffix?: string) => ({
  ts: "2026-08-17T20:00:00.000Z",
  level: "info" as const,
  source: "server" as const,
  message: idSuffix === undefined ? message : `${message}-${idSuffix}`,
})

describe("createLogBuffer", () => {
  test("returns the newest lines within the limit newest first", () => {
    const buffer = createLogBuffer()
    buffer.append(infoLine("one"))
    buffer.append(infoLine("two"))
    buffer.append({
      ts: "2026-08-17T20:00:01.000Z",
      level: "warn",
      source: "agent",
      agentId: "cursor",
      message: "three",
    })

    const listed = buffer.list({ limit: 2 })

    expect(listed.count).toBe(3)
    expect(listed.items.map((record) => record.message)).toEqual(["three", "two"])
    expect(listed.items[0]).toMatchObject({
      id: "3",
      source: "agent",
      agentId: "cursor",
      level: "warn",
    })
  })

  test("filters by min level, source, and agent id", () => {
    const buffer = createLogBuffer()
    buffer.append(infoLine("server-info"))
    buffer.append({
      ts: "2026-08-17T20:00:01.000Z",
      level: "warn",
      source: "agent",
      agentId: "cursor",
      message: "cursor-warn",
    })
    buffer.append({
      ts: "2026-08-17T20:00:02.000Z",
      level: "error",
      source: "agent",
      agentId: "claude-acp",
      message: "claude-error",
    })

    expect(
      buffer.list({ limit: 10, level: "warn" }).items.map((record) => record.message),
    ).toEqual(["claude-error", "cursor-warn"])
    expect(
      buffer.list({ limit: 10, source: "agent", agentId: "cursor" }).items.map(
        (record) => record.message,
      ),
    ).toEqual(["cursor-warn"])
  })

  test("drops the oldest lines when over capacity", () => {
    const buffer = createLogBuffer(2)
    buffer.append(infoLine("keep", "a"))
    buffer.append(infoLine("keep", "b"))
    buffer.append(infoLine("keep", "c"))

    expect(buffer.list({ limit: 10 }).items.map((record) => record.message)).toEqual([
      "keep-c",
      "keep-b",
    ])
  })

  test("clear removes every line", () => {
    const buffer = createLogBuffer()
    buffer.append(infoLine("gone"))
    buffer.clear()

    expect(buffer.list({ limit: 10 })).toEqual({
      items: [],
      count: 0,
      limit: 10,
    })
  })
})
