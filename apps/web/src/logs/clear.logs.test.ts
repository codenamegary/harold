import { afterEach, describe, expect, mock, test } from "bun:test"
import { clearLogs } from "./clear.logs"

const originalFetch = globalThis.fetch

describe("clearLogs", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("deletes /v1/logs", async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 204 })))
    globalThis.fetch = fetchMock as typeof fetch

    await clearLogs()

    expect(fetchMock).toHaveBeenCalledWith("/v1/logs", { method: "DELETE" })
  })

  test("rejects when the logs endpoint fails", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("server error", { status: 500 })),
    ) as typeof fetch

    expect(clearLogs()).rejects.toThrow("Logs clear failed with 500")
  })
})
