import { afterEach, describe, expect, test } from "bun:test"
import { makeNodeFetchStatusEndpoint } from "./reachability.node.adapters"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("makeNodeFetchStatusEndpoint", () => {
  test("returns the response status and body through the platform fetch", async () => {
    const body = JSON.stringify({ version: "0.2.1", state: "online" })
    globalThis.fetch = (async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch

    const fetchStatus = makeNodeFetchStatusEndpoint()
    const result = await fetchStatus("https://agents.example.com/v1/status")

    expect(result).toEqual({
      ok: true,
      response: { status: 200, body },
    })
  })

  test("reports fetch rejections as unreachable with the cause message", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connect ECONNREFUSED")
    }) as typeof fetch

    const fetchStatus = makeNodeFetchStatusEndpoint()
    const result = await fetchStatus("https://agents.example.com/v1/status")

    expect(result).toEqual({
      ok: false,
      detail: "connect ECONNREFUSED",
    })
  })

  test("reports an unparseable URL as unreachable", async () => {
    const fetchStatus = makeNodeFetchStatusEndpoint()
    const result = await fetchStatus("not a url")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.detail.length).toBeGreaterThan(0)
    }
  })
})
