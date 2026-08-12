import { describe, expect, test } from "bun:test"
import {
  SessionStreamClientMessageSchema,
  SessionStreamServerMessageSchema,
} from "./session.stream"

describe("session stream contracts", () => {
  test("parses subscribe and session_update frames", () => {
    expect(
      SessionStreamClientMessageSchema.parse({
        type: "subscribe",
        agentId: "cursor",
        sessionId: "acp-1",
      }),
    ).toEqual({
      type: "subscribe",
      agentId: "cursor",
      sessionId: "acp-1",
    })

    expect(
      SessionStreamServerMessageSchema.parse({
        type: "session_update",
        agentId: "cursor",
        sessionId: "acp-1",
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
      }),
    ).toMatchObject({
      type: "session_update",
      agentId: "cursor",
      sessionId: "acp-1",
    })
  })

  test("rejects subscribe without sessionId", () => {
    expect(() =>
      SessionStreamClientMessageSchema.parse({
        type: "subscribe",
        agentId: "cursor",
      }),
    ).toThrow()
  })
})
