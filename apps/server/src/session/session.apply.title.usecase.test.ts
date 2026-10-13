import { describe, expect, test } from "bun:test"
import { AgentIdSchema } from "contracts/http/agent-settings"
import { makeApplySessionTitle } from "./session.apply.title.usecase"

const agentId = AgentIdSchema.parse("cursor")

const titleStore = (initial?: string) => {
  const state: { title: string | undefined } = { title: initial }
  const broadcasts: Array<{ agentId: typeof agentId; sessionId: string; title: string | null }> = []

  const applySessionTitle = makeApplySessionTitle({
    getSessionTitle: () => state.title,
    rememberSessionTitle: ({ title }) => {
      state.title = title
    },
    forgetSessionTitle: () => {
      state.title = undefined
    },
    broadcastSessionTitle: (params) => {
      broadcasts.push(params)
    },
  })

  return { state, broadcasts, applySessionTitle }
}

describe("makeApplySessionTitle", () => {
  test("remembers and broadcasts a new title", () => {
    const { state, broadcasts, applySessionTitle } = titleStore()

    const result = applySessionTitle({ agentId, sessionId: "s1", title: "Fix the auth flow" })

    expect(result).toEqual({ kind: "renamed" })
    expect(state.title).toBe("Fix the auth flow")
    expect(broadcasts).toEqual([{ agentId, sessionId: "s1", title: "Fix the auth flow" }])
  })

  test("skips a title that matches the remembered one", () => {
    const { broadcasts, applySessionTitle } = titleStore("Steady title")

    const result = applySessionTitle({ agentId, sessionId: "s1", title: "Steady title" })

    expect(result).toEqual({ kind: "unchanged" })
    expect(broadcasts).toEqual([])
  })

  test("forgets and broadcasts a clear when a title is remembered", () => {
    const { state, broadcasts, applySessionTitle } = titleStore("First")

    const result = applySessionTitle({ agentId, sessionId: "s1", title: null })

    expect(result).toEqual({ kind: "cleared" })
    expect(state.title).toBeUndefined()
    expect(broadcasts).toEqual([{ agentId, sessionId: "s1", title: null }])
  })

  test("skips a clear when nothing is remembered", () => {
    const { broadcasts, applySessionTitle } = titleStore()

    const result = applySessionTitle({ agentId, sessionId: "s1", title: null })

    expect(result).toEqual({ kind: "unchanged" })
    expect(broadcasts).toEqual([])
  })
})
