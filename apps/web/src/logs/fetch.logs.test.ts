import { afterEach, describe, expect, mock, test } from "bun:test"
import { LogCollectionSchema } from "contracts/http/logs"
import { fetchLogs } from "./fetch.logs"

const validCollection = LogCollectionSchema.parse({
  items: [
    {
      id: "1",
      ts: "2026-08-17T20:00:00.000Z",
      level: "warn",
      source: "agent",
      message: "ACP agent start failed",
      agentId: "cursor",
    },
  ],
  page: { limit: 200, count: 1 },
})

const originalFetch = globalThis.fetch

describe("fetchLogs", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("fetches /v1/logs and parses with LogCollectionSchema", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(validCollection), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    globalThis.fetch = fetchMock as typeof fetch

    const collection = await fetchLogs()

    expect(fetchMock).toHaveBeenCalledWith("/v1/logs")
    expect(collection).toEqual(validCollection)
  })

  test("sends level and source query params", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(validCollection), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    globalThis.fetch = fetchMock as typeof fetch

    await fetchLogs({ level: "warn", source: "agent" })

    expect(fetchMock).toHaveBeenCalledWith("/v1/logs?level=warn&source=agent")
  })

  test("rejects when the logs endpoint fails", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("server error", {
          status: 500,
        }),
      ),
    ) as typeof fetch

    expect(fetchLogs()).rejects.toThrow("Logs fetch failed with 500")
  })
})
