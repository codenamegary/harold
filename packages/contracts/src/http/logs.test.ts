import { describe, expect, test } from "bun:test"
import {
  ListLogsQuerySchema,
  LogCollectionSchema,
  LogRecordSchema,
} from "./logs"

const validRecord = {
  id: "1",
  ts: "2026-08-17T20:00:00.000Z",
  level: "warn" as const,
  source: "agent" as const,
  message: "ACP agent start failed",
  agentId: "cursor",
}

describe("LogRecordSchema", () => {
  test("accepts a server or agent line", () => {
    expect(LogRecordSchema.parse(validRecord)).toEqual(validRecord)
    expect(
      LogRecordSchema.parse({
        id: "2",
        ts: "2026-08-17T20:00:01.000Z",
        level: "info",
        source: "server",
        message: "agent server listening",
      }),
    ).toEqual({
      id: "2",
      ts: "2026-08-17T20:00:01.000Z",
      level: "info",
      source: "server",
      message: "agent server listening",
    })
  })

  test("rejects unknown sources", () => {
    expect(() =>
      LogRecordSchema.parse({ ...validRecord, source: "syslog" }),
    ).toThrow()
  })
})

describe("LogCollectionSchema", () => {
  test("accepts a collection of log lines", () => {
    const collection = {
      items: [validRecord],
      page: { limit: 200, count: 1 },
    }

    expect(LogCollectionSchema.parse(collection)).toEqual(collection)
  })
})

describe("ListLogsQuerySchema", () => {
  test("defaults limit to 200", () => {
    expect(ListLogsQuerySchema.parse({})).toEqual({ limit: 200 })
  })

  test("accepts min level, source, and agentId filters", () => {
    expect(
      ListLogsQuerySchema.parse({
        limit: "50",
        level: "warn",
        source: "agent",
        agentId: "cursor",
      }),
    ).toEqual({
      limit: 50,
      level: "warn",
      source: "agent",
      agentId: "cursor",
    })
  })
})
