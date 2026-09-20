import { describe, expect, test } from "bun:test"
import { parsePinoLine } from "./logs.pino.line"

describe("parsePinoLine", () => {
  test("maps a pino info line with agentId and reason", () => {
    const record = parsePinoLine(
      JSON.stringify({
        level: 40,
        time: Date.parse("2026-08-17T20:00:00.000Z"),
        msg: "ACP agent start failed",
        agentId: "cursor",
        reason: "Agent executable path is not configured",
      }),
    )

    expect(record).toEqual({
      ts: "2026-08-17T20:00:00.000Z",
      level: "warn",
      source: "server",
      message: "ACP agent start failed Agent executable path is not configured",
      agentId: "cursor",
    })
  })

  test("includes method and url from a request log", () => {
    const record = parsePinoLine(
      JSON.stringify({
        level: 30,
        time: Date.parse("2026-08-17T20:00:00.000Z"),
        msg: "incoming request",
        req: { method: "POST", url: "/v1/sessions" },
      }),
    )

    expect(record).toMatchObject({
      level: "info",
      message: "incoming request POST /v1/sessions",
    })
  })

  test("keeps non-JSON text as a server info line", () => {
    const record = parsePinoLine("not json")

    expect(record).toMatchObject({
      level: "info",
      source: "server",
      message: "not json",
    })
  })

  test("returns null for a blank line", () => {
    expect(parsePinoLine("  \n")).toBeNull()
  })
})
