import { describe, expect, test } from "bun:test"
import { StatusSchema } from "./status"

const validStatus = {
  version: "0.1.0",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-07-24T12:00:00.000Z",
  acp: {
    state: "stopped",
    activeSessions: 0,
  },
} as const

describe("StatusSchema", () => {
  test("accepts a valid MS1 status payload", () => {
    expect(StatusSchema.parse(validStatus)).toEqual(validStatus)
  })

  test("accepts wildcard and private bind addresses", () => {
    expect(StatusSchema.parse({ ...validStatus, bindAddress: "0.0.0.0" }).bindAddress).toBe(
      "0.0.0.0",
    )
    expect(StatusSchema.parse({ ...validStatus, bindAddress: "10.0.0.236" }).bindAddress).toBe(
      "10.0.0.236",
    )
  })

  test("rejects a bind address that is not an IP address", () => {
    expect(() => StatusSchema.parse({ ...validStatus, bindAddress: "harold.local" })).toThrow()
  })

  test("rejects prototype connection mode fields", () => {
    expect(() => StatusSchema.parse({ ...validStatus, connectionMode: "local" })).toThrow()
  })

  test("rejects server-computed uptime fields", () => {
    expect(() => StatusSchema.parse({ ...validStatus, uptimeSeconds: 42 })).toThrow()
  })
})
