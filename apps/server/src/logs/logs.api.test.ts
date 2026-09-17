import { describe, expect, test } from "bun:test"
import { LogCollectionSchema } from "contracts/http/logs"
import { bootTestApp } from "../test-support/test.harness"

describe("GET /v1/logs", () => {
  test("returns recent pino lines from this process", async () => {
    const { app } = await bootTestApp()
    const marker = "cursor-chat-failed-probe"

    app.log.warn({ agentId: "cursor", reason: "session ended" }, marker)

    const response = await app.inject({
      method: "GET",
      url: "/v1/logs",
    })
    const body = LogCollectionSchema.parse(JSON.parse(response.body))
    const match = body.items.find((record) => record.message.includes(marker))

    expect(response.statusCode).toBe(200)
    expect(match).toMatchObject({
      level: "warn",
      source: "server",
      agentId: "cursor",
    })
    expect(match?.message).toContain("session ended")
  })

  test("filters to min level", async () => {
    const { app } = await bootTestApp()
    const infoMarker = "logs-info-only"
    const warnMarker = "logs-warn-only"

    app.log.info(infoMarker)
    app.log.warn(warnMarker)

    const response = await app.inject({
      method: "GET",
      url: "/v1/logs?level=warn",
    })
    const body = LogCollectionSchema.parse(JSON.parse(response.body))

    expect(body.items.some((record) => record.message.includes(infoMarker))).toBe(false)
    expect(body.items.some((record) => record.message.includes(warnMarker))).toBe(true)
  })
})

describe("DELETE /v1/logs", () => {
  test("clears the process log buffer", async () => {
    const { app } = await bootTestApp()
    const marker = "logs-clear-probe"

    app.log.info(marker)

    const before = LogCollectionSchema.parse(
      JSON.parse((await app.inject({ method: "GET", url: "/v1/logs" })).body),
    )
    expect(before.items.some((record) => record.message.includes(marker))).toBe(true)

    const cleared = await app.inject({ method: "DELETE", url: "/v1/logs" })
    expect(cleared.statusCode).toBe(204)

    const after = LogCollectionSchema.parse(
      JSON.parse((await app.inject({ method: "GET", url: "/v1/logs" })).body),
    )
    expect(after.items).toEqual([])
    expect(after.page.count).toBe(0)
  })
})
