import { describe, expect, test } from "bun:test"
import { createCursorExtensionHandlers } from "./cursor"
import { extensionHandlers, resolveExtensionHandlers } from "./extension.handlers"
import { resolveExtensionHandler } from "./types"

describe("extension handlers", () => {
  test("cursor ask_question forwards to requestExtensionRpc", async () => {
    const calls: unknown[] = []
    const handlers = createCursorExtensionHandlers("cursor", async (input) => {
      calls.push(input)
      return {
        outcome: {
          outcome: "answered",
          answers: [{ questionId: "q1", selectedOptionIds: ["first"] }],
        },
      }
    })

    const result = await handlers["cursor/ask_question"]({
      sessionId: "sess-1",
      toolCallId: "call-1",
      questions: [{
        id: "q1",
        prompt: "Pick one",
        options: [
          { id: "first", label: "First" },
          { id: "second", label: "Second" },
        ],
      }],
    })

    expect(calls).toEqual([
      {
        agentId: "cursor",
        sessionId: "sess-1",
        method: "cursor/ask_question",
        params: {
          sessionId: "sess-1",
          toolCallId: "call-1",
          questions: [{
            id: "q1",
            prompt: "Pick one",
            options: [
              { id: "first", label: "First" },
              { id: "second", label: "Second" },
            ],
          }],
        },
      },
    ])
    expect(result).toEqual({
      outcome: {
        outcome: "answered",
        answers: [{ questionId: "q1", selectedOptionIds: ["first"] }],
      },
    })
  })

  test("cursor create_plan forwards to requestExtensionRpc", async () => {
    const handlers = createCursorExtensionHandlers("cursor", async () => ({
      outcome: { outcome: "accepted" },
    }))

    const result = await handlers["cursor/create_plan"]({
      sessionId: "sess-2",
      toolCallId: "call-2",
      plan: "Plan text",
      todos: [],
    })

    expect(result).toEqual({
      outcome: { outcome: "accepted" },
    })
  })

  test("unknown extensions are logged and rejected", async () => {
    const logged: string[] = []
    const handlers = createCursorExtensionHandlers("cursor", async () => ({}))
    const handler = resolveExtensionHandler({
      method: "vendor/unknown",
      extensionHandlers: handlers,
      onUnknown: (method) => logged.push(method),
    })

    expect(logged).toEqual(["vendor/unknown"])
    expect(() => handler?.({})).toThrow("unknown extension: vendor/unknown")
  })

  test("resolveExtensionHandlers uses the cursor factory and lets profile handlers win", async () => {
    expect(extensionHandlers.cursor).toBe(createCursorExtensionHandlers)

    const rpc = async () => ({})
    const resolved = resolveExtensionHandlers("cursor", rpc, {
      "cursor/ask_question": () => ({ fromProfile: true }),
    })

    expect(await resolved["cursor/ask_question"]({})).toEqual({ fromProfile: true })
    expect(resolved["cursor/create_plan"]).toBeDefined()
  })

  test("resolveExtensionHandlers returns only profile handlers for agents with no factory", () => {
    const profile = { "vendor/custom": () => ({ ok: true }) }
    expect(resolveExtensionHandlers("opencode", async () => ({}), profile)).toEqual(profile)
  })
})
