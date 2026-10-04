import { afterEach, describe, expect, mock, test } from "bun:test"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { fetchWorkspaces } from "./fetch.workspaces"

const validCollection = WorkspaceCollectionSchema.parse({
  items: [
    {
      id: "ws-harold",
      name: "harold",
      path: "/home/operator/harold",
      state: "available",
      createdAt: "2026-07-24T12:00:00.000Z",
      lastUsedAt: "2026-07-24T12:05:00.000Z",
    },
  ],
  page: { limit: 20, count: 1 },
})

const originalFetch = globalThis.fetch

describe("fetchWorkspaces", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("fetches /v1/workspaces and parses with WorkspaceCollectionSchema", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(validCollection), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    globalThis.fetch = fetchMock as typeof fetch

    const collection = await fetchWorkspaces()

    expect(fetchMock).toHaveBeenCalledWith("/v1/workspaces")
    expect(collection).toEqual(validCollection)
  })

  test("sends search and state query params", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(validCollection), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    globalThis.fetch = fetchMock as typeof fetch

    await fetchWorkspaces({ q: "agent", state: "available", limit: 10, cursor: "abc" })

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/workspaces?limit=10&cursor=abc&q=agent&state=available",
    )
  })

  test("rejects when the workspaces endpoint fails", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("server error", {
          status: 500,
        }),
      ),
    ) as typeof fetch

    expect(fetchWorkspaces()).rejects.toThrow("Workspaces fetch failed with 500")
  })
})
