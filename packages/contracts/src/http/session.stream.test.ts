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

  test("parses a session_config frame with the full option array", () => {
    expect(
      SessionStreamServerMessageSchema.parse({
        type: "session_config",
        agentId: "cursor",
        sessionId: "acp-1",
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "m1",
            options: [{ value: "m1", name: "M1" }],
          },
        ],
      }),
    ).toEqual({
      type: "session_config",
      agentId: "cursor",
      sessionId: "acp-1",
      configOptions: [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "m1",
          options: [{ value: "m1", name: "M1" }],
        },
      ],
    })

    expect(() =>
      SessionStreamServerMessageSchema.parse({
        type: "session_config",
        agentId: "cursor",
        sessionId: "acp-1",
        configOptions: [{ type: "slider" }],
      }),
    ).toThrow()
  })

  test("rejects subscribe without sessionId", () => {
    expect(() =>
      SessionStreamClientMessageSchema.parse({
        type: "subscribe",
        agentId: "cursor",
      }),
    ).toThrow()
  })

  test("parses extension_request and extension_reply frames", () => {
    expect(
      SessionStreamServerMessageSchema.parse({
        type: "extension_request",
        requestId: "req-1",
        method: "cursor/ask_question",
        agentId: "cursor",
        sessionId: "acp-1",
        params: { sessionId: "acp-1" },
      }),
    ).toMatchObject({
      type: "extension_request",
      method: "cursor/ask_question",
    })

    expect(
      SessionStreamClientMessageSchema.parse({
        type: "extension_reply",
        requestId: "req-1",
        result: { outcome: { outcome: "skipped" } },
      }),
    ).toEqual({
      type: "extension_reply",
      requestId: "req-1",
      result: { outcome: { outcome: "skipped" } },
    })
  })

  test("parses prompt_complete and cancelled frames", () => {
    expect(
      SessionStreamServerMessageSchema.parse({
        type: "prompt_complete",
        agentId: "cursor",
        sessionId: "acp-1",
      }),
    ).toEqual({
      type: "prompt_complete",
      agentId: "cursor",
      sessionId: "acp-1",
    })

    expect(
      SessionStreamServerMessageSchema.parse({
        type: "cancelled",
        agentId: "cursor",
        sessionId: "acp-1",
      }),
    ).toEqual({
      type: "cancelled",
      agentId: "cursor",
      sessionId: "acp-1",
    })
  })

  test("parses auth_session_updated frames", () => {
    expect(
      SessionStreamServerMessageSchema.parse({
        type: "auth_session_updated",
        agentId: "claude",
        auth: {
          agentId: "claude",
          status: "needs_auth",
          error: null,
          session: {
            sessionId: "auth-1",
            agentId: "claude",
            status: "in_progress",
            steps: [
              {
                type: "show_message",
                level: "info",
                body: "Sign in on the host",
              },
            ],
            error: null,
          },
        },
      }),
    ).toMatchObject({
      type: "auth_session_updated",
      agentId: "claude",
      auth: {
        agentId: "claude",
        status: "needs_auth",
      },
    })
  })
})
