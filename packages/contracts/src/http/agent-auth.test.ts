import { describe, expect, test } from "bun:test"
import {
  AgentAuthSchema,
  AgentAuthSessionSchema,
  AgentAuthSummarySchema,
  AuthCancelActionSchema,
  AuthConfirmActionSchema,
  AuthDoneStepSchema,
  AuthStepSchema,
  AuthStepV1Schema,
} from "./agent-auth"

describe("AgentAuthSummarySchema", () => {
  test("accepts a valid auth summary", () => {
    expect(
      AgentAuthSummarySchema.parse({
        status: "needs_auth",
        error: null,
        activeSessionId: null,
        canLogout: true,
      }),
    ).toEqual({
      status: "needs_auth",
      error: null,
      activeSessionId: null,
      canLogout: true,
    })
  })
})

describe("AuthStepV1Schema", () => {
  test("accepts v1 host-login steps", () => {
    expect(
      AuthStepV1Schema.parse({
        type: "show_message",
        level: "info",
        body: "Sign in on the host.",
      }),
    ).toEqual({
      type: "show_message",
      level: "info",
      body: "Sign in on the host.",
    })

    expect(
      AuthStepV1Schema.parse({
        type: "confirm",
        stepId: "host-login",
        title: "Sign in",
        body: "Run login on the host.",
        confirmLabel: "I have logged in",
      }),
    ).toMatchObject({ type: "confirm", stepId: "host-login" })

    expect(
      AuthDoneStepSchema.parse({
        type: "done",
        outcome: "succeeded",
        message: null,
      }),
    ).toEqual({
      type: "done",
      outcome: "succeeded",
      message: null,
    })
  })

  test("rejects non host-login step types", () => {
    expect(() =>
      AuthStepV1Schema.parse({
        type: "paste_secret",
        stepId: "secret",
        label: "API key",
        placeholder: null,
        secretKind: "api_key",
      }),
    ).toThrow()
  })
})

describe("AuthStepSchema", () => {
  test("rejects non host-login step types on the wire", () => {
    expect(() =>
      AuthStepSchema.parse({
        type: "paste_secret",
        stepId: "secret",
        label: "API key",
        placeholder: null,
        secretKind: "api_key",
      }),
    ).toThrow()
  })
})

describe("AuthSessionActionSchema", () => {
  test("accepts confirm and cancel actions", () => {
    expect(AuthConfirmActionSchema.parse({ type: "confirm", stepId: "host-login" })).toEqual({
      type: "confirm",
      stepId: "host-login",
    })
    expect(AuthCancelActionSchema.parse({ type: "cancel" })).toEqual({ type: "cancel" })
  })
})

describe("AgentAuthSessionSchema", () => {
  test("accepts an in-progress session", () => {
    expect(
      AgentAuthSessionSchema.parse({
        sessionId: "sess-1",
        agentId: "claude-acp",
        status: "in_progress",
        steps: [
          {
            type: "show_message",
            level: "info",
            body: "Sign in on the host.",
          },
        ],
        error: null,
      }),
    ).toMatchObject({ sessionId: "sess-1", status: "in_progress" })
  })
})

describe("AgentAuthSchema", () => {
  test("accepts auth with no active session", () => {
    expect(
      AgentAuthSchema.parse({
        agentId: "claude-acp",
        status: "unknown",
        error: null,
        session: null,
      }),
    ).toEqual({
      agentId: "claude-acp",
      status: "unknown",
      error: null,
      session: null,
    })
  })
})
