import { describe, expect, test } from "bun:test"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  ValidationProblemSchema,
} from "contracts/http/error"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { enableAgent } from "../test-support/test.app"
import { bootTestApp } from "../test-support/test.harness"

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

const fakeConfigOptions = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "m1",
    options: [
      { value: "m1", name: "M1" },
      { value: "m2", name: "M2" },
    ],
  },
]

const createConfigApp = async (extraFakeOptions: Record<string, unknown> = {}) => {
  const { app } = await bootTestApp({
    whichFn,
    fakeAcpOptions: {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "fake-session-new",
      sessionLoadSessionId: "fake-session-new",
      configOptions: fakeConfigOptions,
      ...extraFakeOptions,
    },
  })
  await enableAgent(app, "cursor", whichFn)
  return app
}

const createSession = async (app: Awaited<ReturnType<typeof createConfigApp>>) => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    payload: { agentId: "cursor", cwd: "/tmp/project" },
  })
  expect(response.statusCode).toBe(201)
  return CreateSessionResponseSchema.parse(JSON.parse(response.body))
}

describe("PUT /v1/sessions/:sessionId/config-options/:configId", () => {
  test("sets one option and returns 202 with an empty body", async () => {
    const app = await createConfigApp()
    const session = await createSession(app)

    const response = await app.inject({
      method: "PUT",
      url: `/v1/sessions/${session.sessionId}/config-options/model`,
      query: { agentId: "cursor" },
      payload: { value: "m2" },
    })

    expect(response.statusCode).toBe(202)
    expect(response.body).toBe("")
  })

  test("returns 404 for an unknown session", async () => {
    const app = await createConfigApp()
    await createSession(app)

    const response = await app.inject({
      method: "PUT",
      url: "/v1/sessions/never-created/config-options/model",
      query: { agentId: "cursor" },
      payload: { value: "m2" },
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(404)
    expect(body.type).toBe(PROBLEM_TYPES.notFound)
  })

  test("returns 404 for an unknown agent id", async () => {
    const app = await createConfigApp()
    const session = await createSession(app)

    const response = await app.inject({
      method: "PUT",
      url: `/v1/sessions/${session.sessionId}/config-options/model`,
      query: { agentId: "unknown" },
      payload: { value: "m2" },
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(404)
    expect(body.type).toBe(PROBLEM_TYPES.notFound)
  })

  test("returns 422 when the agent rejects an unknown configId", async () => {
    const app = await createConfigApp()
    const session = await createSession(app)

    const response = await app.inject({
      method: "PUT",
      url: `/v1/sessions/${session.sessionId}/config-options/nope`,
      query: { agentId: "cursor" },
      payload: { value: "m2" },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(422)
    expect(body.type).toBe(PROBLEM_TYPES.validationError)
  })

  test("returns 422 when the value is outside the option list", async () => {
    const app = await createConfigApp()
    const session = await createSession(app)

    const response = await app.inject({
      method: "PUT",
      url: `/v1/sessions/${session.sessionId}/config-options/model`,
      query: { agentId: "cursor" },
      payload: { value: "not-a-model" },
    })

    expect(response.statusCode).toBe(422)
  })

  test("returns 400 for a malformed body", async () => {
    const app = await createConfigApp()
    const session = await createSession(app)

    const response = await app.inject({
      method: "PUT",
      url: `/v1/sessions/${session.sessionId}/config-options/model`,
      query: { agentId: "cursor" },
      payload: { value: 3 },
    })

    expect(response.statusCode).toBe(400)
    expect(() => ValidationProblemSchema.parse(JSON.parse(response.body))).not.toThrow()
  })

  test("returns 409 when the agent does not support set_config_option", async () => {
    const app = await createConfigApp({ setConfigOption: false })
    const session = await createSession(app)

    const response = await app.inject({
      method: "PUT",
      url: `/v1/sessions/${session.sessionId}/config-options/model`,
      query: { agentId: "cursor" },
      payload: { value: "m2" },
    })

    const body = ConflictProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(409)
    expect(body.type).toBe(PROBLEM_TYPES.conflict)
  })
})
