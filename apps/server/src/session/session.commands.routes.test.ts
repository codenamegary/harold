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
  resolvePermissionReply: () => "settled",
  resolveExtensionReply: () => "settled",
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
