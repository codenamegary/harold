import { describe, expect, test } from "bun:test"
import {
  ConflictProblemSchema,
  PROBLEM_TYPES,
  UnprocessableProblemSchema,
} from "contracts/http/error"
import Fastify from "fastify"
import { AUTH_GATED_PROMPT_MESSAGE } from "../acp/auth.required"
import { SessionHub, SessionPromptCommandResult } from "./hub/hub"
import { registerSessionCommandsRoutes } from "./session.commands.routes"

const stubHub = (promptResult: SessionPromptCommandResult): SessionHub => ({
  addSubscriber: () => {},
  removeSubscriber: () => {},
  getSubscriberSession: () => null,
  subscribe: async () => {},
  switchSession: async () => {},
  prompt: async () => promptResult,
  cancel: async () => ({ ok: true }),
  handleSessionUpdate: () => {},
  handleSessionConfig: () => {},
  broadcastAuthSessionUpdated: () => {},
  requestPermission: async () => ({}),
  requestExtensionRpc: async () => ({}),
  requestElicitation: async () => ({}),
  resolvePermissionReply: () => "settled",
  resolveExtensionReply: () => "settled",
  resolveElicitationReply: () => "settled",
  completeElicitation: () => {},
  cancelElicitationByAgent: () => {},
  closeSession: () => {},
  agentExited: () => {},
})

const appWithPromptResult = (promptResult: SessionPromptCommandResult) => {
  const app = Fastify()
  registerSessionCommandsRoutes(app, { sessionHub: stubHub(promptResult) })
  return app
}

describe("session command problem mapping", () => {
  test("maps auth_gated prompt failures to a 409 auth-required problem", async () => {
    const app = appWithPromptResult({
      ok: false,
      error: { kind: "auth_gated", reason: AUTH_GATED_PROMPT_MESSAGE },
    })

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/s1/prompts?agentId=cursor",
      payload: { text: "hello" },
    })

    expect(response.statusCode).toBe(409)
    const problem = ConflictProblemSchema.parse(JSON.parse(response.body))
    expect(problem.type).toBe(PROBLEM_TYPES.conflict)
    expect(problem.title).toBe("Agent authentication required")
    expect(problem.detail).toBe(AUTH_GATED_PROMPT_MESSAGE)
  })

  test("maps rejected prompt failures to a 422 unprocessable problem", async () => {
    const app = appWithPromptResult({
      ok: false,
      error: {
        kind: "rejected",
        reason: "Agent does not advertise promptCapabilities.image — cannot attach shot.png",
      },
    })

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/s1/prompts?agentId=cursor",
      payload: { text: "hello" },
    })

    expect(response.statusCode).toBe(422)
    const problem = UnprocessableProblemSchema.parse(JSON.parse(response.body))
    expect(problem.type).toBe(PROBLEM_TYPES.unprocessable)
    expect(problem.detail).toBe(
      "Agent does not advertise promptCapabilities.image — cannot attach shot.png",
    )
  })

  test("maps unknown_session prompt failures to a 404 problem", async () => {
    const app = appWithPromptResult({
      ok: false,
      error: { kind: "unknown_session", reason: "Unknown session cwd" },
    })

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions/s1/prompts?agentId=cursor",
      payload: { text: "hello" },
    })

    expect(response.statusCode).toBe(404)
  })
})

describe("elicitation reply route", () => {
  const appWithElicitationOutcome = (
    outcome: "settled" | "already_settled" | "unknown",
    onResult: (result: unknown) => void = () => undefined,
  ) => {
    const app = Fastify()
    registerSessionCommandsRoutes(app, {
      sessionHub: {
        ...stubHub({ ok: true }),
        resolveElicitationReply: ({ result }) => {
          onResult(result)
          return outcome
        },
      },
    })
    return app
  }

  test("accepts the raw result and returns 204", async () => {
    const results: unknown[] = []
    const app = appWithElicitationOutcome("settled", (result) => results.push(result))
    const result = { action: "accept", content: { q0: "bun" } }

    const response = await app.inject({
      method: "POST",
      url: "/v1/elicitations/req%3A1/replies",
      payload: { result },
    })

    expect(response.statusCode).toBe(204)
    expect(results).toEqual([result])
  })

  test("returns 404 for an unknown request and 409 when already settled", async () => {
    const unknown = await appWithElicitationOutcome("unknown").inject({
      method: "POST",
      url: "/v1/elicitations/req-1/replies",
      payload: { result: { action: "cancel" } },
    })
    expect(unknown.statusCode).toBe(404)

    const settled = await appWithElicitationOutcome("already_settled").inject({
      method: "POST",
      url: "/v1/elicitations/req-1/replies",
      payload: { result: { action: "cancel" } },
    })
    expect(settled.statusCode).toBe(409)
  })
})
