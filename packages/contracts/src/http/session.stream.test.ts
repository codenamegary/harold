import { describe, expect, test } from "bun:test"
import {
  ElicitationReplyBodySchema,
  ExtensionReplyBodySchema,
  PermissionReplyBodySchema,
  ReplyParamsSchema,
  SessionCommandParamsSchema,
  SessionCommandQuerySchema,
  SessionStreamServerMessageSchema,
  elicitationRepliesPath,
  extensionRepliesPath,
  permissionRepliesPath,
  sessionCancelPath,
  sessionEventsPath,
  sessionPromptsPath,
} from "./session.stream"

describe("session stream contracts", () => {
  test("parses a stream_reset frame", () => {
    expect(
      SessionStreamServerMessageSchema.parse({
        type: "stream_reset",
        agentId: "cursor",
        sessionId: "acp-1",
      }),
    ).toEqual({
      type: "stream_reset",
      agentId: "cursor",
      sessionId: "acp-1",
    })
  })

  test("parses a session_update frame", () => {
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

  test("parses an extension_request frame", () => {
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
  })

  test("parses elicitation request, resolved, and completed frames", () => {
    expect(
      SessionStreamServerMessageSchema.parse({
        type: "elicitation_request",
        requestId: "req-1",
        agentId: "opencode",
        sessionId: "acp-1",
        params: { mode: "form", sessionId: "acp-1" },
        expiresAt: "2026-10-31T05:00:00.000Z",
      }),
    ).toEqual({
      type: "elicitation_request",
      requestId: "req-1",
      agentId: "opencode",
      sessionId: "acp-1",
      params: { mode: "form", sessionId: "acp-1" },
      expiresAt: "2026-10-31T05:00:00.000Z",
    })

    expect(
      SessionStreamServerMessageSchema.parse({
        type: "elicitation_resolved",
        requestId: "req-1",
        agentId: "opencode",
        sessionId: "acp-1",
        reason: "replied",
        result: { action: "accept", content: { q0: "bun" } },
      }),
    ).toEqual({
      type: "elicitation_resolved",
      requestId: "req-1",
      agentId: "opencode",
      sessionId: "acp-1",
      reason: "replied",
      result: { action: "accept", content: { q0: "bun" } },
    })

    expect(
      SessionStreamServerMessageSchema.parse({
        type: "elicitation_completed",
        elicitationId: "url-1",
        requestId: "req-2",
        agentId: "opencode",
        sessionId: "acp-1",
      }),
    ).toEqual({
      type: "elicitation_completed",
      elicitationId: "url-1",
      requestId: "req-2",
      agentId: "opencode",
      sessionId: "acp-1",
    })

    expect(() =>
      SessionStreamServerMessageSchema.parse({
        type: "elicitation_resolved",
        requestId: "req-1",
        agentId: "opencode",
        sessionId: "acp-1",
        reason: "unknown_reason",
      }),
    ).toThrow()
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

  test("parses session_info frames with a title and with a null clear", () => {
    expect(
      SessionStreamServerMessageSchema.parse({
        type: "session_info",
        agentId: "cursor",
        sessionId: "acp-1",
        title: "Fix the auth flow",
      }),
    ).toEqual({
      type: "session_info",
      agentId: "cursor",
      sessionId: "acp-1",
      title: "Fix the auth flow",
    })

    expect(
      SessionStreamServerMessageSchema.parse({
        type: "session_info",
        agentId: "cursor",
        sessionId: "acp-1",
        title: null,
      }),
    ).toEqual({
      type: "session_info",
      agentId: "cursor",
      sessionId: "acp-1",
      title: null,
    })

    expect(() =>
      SessionStreamServerMessageSchema.parse({
        type: "session_info",
        agentId: "cursor",
        sessionId: "acp-1",
      }),
    ).toThrow()
  })
})

describe("session stream REST paths", () => {
  test("builds the events, prompts, and cancel paths with encoded ids", () => {
    expect(sessionEventsPath("acp:1/two", { agentId: "cursor" })).toBe(
      "/v1/sessions/acp%3A1%2Ftwo/events?agentId=cursor",
    )
    expect(sessionPromptsPath("acp:1/two", { agentId: "cursor" })).toBe(
      "/v1/sessions/acp%3A1%2Ftwo/prompts?agentId=cursor",
    )
    expect(sessionCancelPath("acp:1/two", { agentId: "cursor" })).toBe(
      "/v1/sessions/acp%3A1%2Ftwo/cancel?agentId=cursor",
    )
  })

  test("builds permission, extension, and elicitation reply paths with an encoded request id", () => {
    expect(permissionRepliesPath("req:1/two")).toBe("/v1/permissions/req%3A1%2Ftwo/replies")
    expect(extensionRepliesPath("req:1/two")).toBe("/v1/extensions/req%3A1%2Ftwo/replies")
    expect(elicitationRepliesPath("req:1/two")).toBe("/v1/elicitations/req%3A1%2Ftwo/replies")
  })
})

describe("PermissionReplyBodySchema", () => {
  test("parses only the optionId body", () => {
    expect(PermissionReplyBodySchema.parse({ optionId: "allow-once" })).toEqual({
      optionId: "allow-once",
    })

    expect(() => PermissionReplyBodySchema.parse({ optionId: "" })).toThrow()
    expect(() =>
      PermissionReplyBodySchema.parse({
        type: "permission_reply",
        optionId: "allow-once",
      }),
    ).toThrow()
  })
})

describe("session command route params and query", () => {
  test("parses the path params and the agentId query", () => {
    expect(SessionCommandParamsSchema.parse({ sessionId: "acp-1" })).toEqual({
      sessionId: "acp-1",
    })
    expect(SessionCommandQuerySchema.parse({ agentId: "cursor" })).toEqual({
      agentId: "cursor",
    })
    expect(ReplyParamsSchema.parse({ requestId: "req-1" })).toEqual({
      requestId: "req-1",
    })

    expect(() => SessionCommandParamsSchema.parse({ sessionId: "" })).toThrow()
    expect(() => SessionCommandQuerySchema.parse({})).toThrow()
    expect(() => ReplyParamsSchema.parse({ requestId: "" })).toThrow()
    expect(() => SessionCommandQuerySchema.parse({ agentId: "cursor", extra: true })).toThrow()
  })
})

describe("ElicitationReplyBodySchema", () => {
  test("parses an opaque result body only", () => {
    const body = { result: { action: "accept", content: { q0: "bun" } } }
    expect(ElicitationReplyBodySchema.parse(body)).toEqual(body)

    expect(() =>
      ElicitationReplyBodySchema.parse({
        requestId: "req-1",
        result: { action: "cancel" },
      }),
    ).toThrow()
  })
})

describe("ExtensionReplyBodySchema", () => {
  test("parses an opaque result body and rejects the WS envelope", () => {
    const body = { result: { outcome: { outcome: "skipped" } } }
    expect(ExtensionReplyBodySchema.parse(body)).toEqual(body)

    expect(() =>
      ExtensionReplyBodySchema.parse({
        requestId: "req-1",
        result: { outcome: { outcome: "skipped" } },
      }),
    ).toThrow()
  })
})
