import { describe, expect, test } from "bun:test"
import { cursorExtensionHandlers, resolveExtensionHandler } from "./extension-handlers"

describe("extension handlers", () => {
  test("cursor ask_question selects the first option", async () => {
    const result = await cursorExtensionHandlers["cursor/ask_question"]({
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

    expect(result).toEqual({
      outcome: {
        outcome: "answered",
        answers: [{ questionId: "q1", selectedOptionIds: ["first"] }],
      },
    })
  })

  test("cursor create_plan is accepted", async () => {
    const result = await cursorExtensionHandlers["cursor/create_plan"]({
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
    const handler = resolveExtensionHandler({
      method: "vendor/unknown",
      extensionHandlers: cursorExtensionHandlers,
      onUnknown: (method) => logged.push(method),
    })

    expect(logged).toEqual(["vendor/unknown"])
    expect(() => handler?.({})).toThrow("unknown extension: vendor/unknown")
  })
})
