import { afterEach, describe, expect, test } from "bun:test"
import { AgentIdSchema } from "contracts/http/agent-settings"
import { requestUrl } from "../test/request.url"
import { deleteSessions } from "./delete.session"

const agentId = AgentIdSchema.parse("cursor")

describe("deleteSessions", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("deletes one session at a time", async () => {
    const active = { count: 0, max: 0 }

    globalThis.fetch = async () => {
      active.count += 1
      active.max = Math.max(active.max, active.count)
      await new Promise((resolve) => setTimeout(resolve, 20))
      active.count -= 1
      return new Response(null, { status: 204 })
    }

    const items = Array.from({ length: 3 }, (_, index) => ({
      agentId,
      sessionId: `session-${index}`,
    }))

    const result = await deleteSessions(items)

    expect(result.deleted).toHaveLength(3)
    expect(result.failed).toHaveLength(0)
    expect(active.max).toBe(1)
  })

  test("stops before remaining deletes when aborted", async () => {
    const started: string[] = []
    const controller = new AbortController()

    globalThis.fetch = async (input: RequestInfo | URL) => {
      started.push(requestUrl(input))
      if (started.length === 1) {
        controller.abort()
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
      if (controller.signal.aborted) {
        const error = new Error("The operation was aborted.")
        error.name = "AbortError"
        throw error
      }
      return new Response(null, { status: 204 })
    }

    const items = [
      { agentId, sessionId: "session-0" },
      { agentId, sessionId: "session-1" },
      { agentId, sessionId: "session-2" },
    ]

    const result = await deleteSessions(items, { signal: controller.signal })

    expect(started).toHaveLength(1)
    expect(result.deleted).toHaveLength(0)
    expect(result.failed).toHaveLength(0)
  })
})
