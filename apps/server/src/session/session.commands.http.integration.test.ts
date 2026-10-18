import { describe, expect, test } from "bun:test"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  UnprocessableProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { enableAgent } from "../test-support/test.app"
import { bootTestApp } from "../test-support/test.harness"
import { boundStreamUrl, openStreamClient } from "../test-support/session.stream.smoke"

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

const promptsUrl = (sessionId: string) =>
  `/v1/sessions/${encodeURIComponent(sessionId)}/prompts?agentId=cursor`

const createSession = async (
  app: Parameters<typeof authHeaders>[0] & {
    inject: (opts: {
      headers: Record<string, string>
      method: "POST"
      url: string
      payload: unknown
    }) => Promise<{ statusCode: number; body: string }>
  },
  cwd: string,
) => {
  const response = await app.inject({
    headers: authHeaders(app),
    method: "POST",
    url: "/v1/sessions",
    payload: { agentId: "cursor", cwd },
  })
  expect(response.statusCode).toBe(201)
  return CreateSessionResponseSchema.parse(JSON.parse(response.body))
}

describe("POST /v1/sessions/:sessionId/prompts", () => {
  test("accepts a prompt and subscribed streams see prompt_complete", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "cmd-http-1",
        sessionLoadSessionId: "cmd-http-1",
        promptCompletionDelayMs: 50,
      },
    })
    await enableAgent(app, "cursor", whichFn)
    await app.listen({ host: config.host, port: 0 })

    const created = await createSession(app, "/tmp/cmd-http-project")
    const client = await openStreamClient(boundStreamUrl(app), app.deviceCredential.credential)
    client.send({ type: "subscribe", agentId: "cursor", sessionId: created.sessionId })
    await client.waitFor((message) => message.type === "subscribed")

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: promptsUrl(created.sessionId),
      payload: { text: "hello commands" },
    })
    expect(response.statusCode).toBe(202)

    await client.waitFor((message) => message.type === "prompt_complete")
    expect(client.messages.some((message) => message.type === "error")).toBe(false)

    await client.close()
  }, 30_000)

  test("returns 400 for an empty prompt body", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: promptsUrl("any-session"),
      payload: { text: "" },
    })

    expect(response.statusCode).toBe(400)
    const problem = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(problem.type).toBe(PROBLEM_TYPES.validationError)
  })

  test("returns 404 for an unknown session", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: promptsUrl("nope"),
      payload: { text: "hello" },
    })

    expect(response.statusCode).toBe(404)
    const problem = NotFoundProblemSchema.parse(JSON.parse(response.body))
    expect(problem.type).toBe(PROBLEM_TYPES.notFound)
  })

  test("returns 422 when the agent does not advertise the attachment capability", async () => {
    const { app } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "cmd-http-422",
        sessionLoadSessionId: "cmd-http-422",
      },
    })
    await enableAgent(app, "cursor", whichFn)

    const created = await createSession(app, "/tmp/cmd-http-422")
    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: promptsUrl(created.sessionId),
      payload: {
        text: "look",
        attachments: [
          {
            kind: "image",
            name: "shot.png",
            mimeType: "image/png",
            path: "/tmp/cmd-http-422/.harold/attachments/att_1.png",
          },
        ],
      },
    })

    expect(response.statusCode).toBe(422)
    const problem = UnprocessableProblemSchema.parse(JSON.parse(response.body))
    expect(problem.type).toBe(PROBLEM_TYPES.unprocessable)
    expect(problem.detail).toBe(
      "Agent does not advertise promptCapabilities.image — cannot attach shot.png",
    )
  })

  test("auth at the RPC returns 202 and the stream reports the gated error", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "cmd-http-auth",
        sessionLoadSessionId: "cmd-http-auth",
        promptFailsWithAuthRequired: true,
      },
    })
    await enableAgent(app, "cursor", whichFn)
    await app.listen({ host: config.host, port: 0 })

    const created = await createSession(app, "/tmp/cmd-http-auth")
    const client = await openStreamClient(boundStreamUrl(app), app.deviceCredential.credential)
    client.send({ type: "subscribe", agentId: "cursor", sessionId: created.sessionId })
    await client.waitFor((message) => message.type === "subscribed")

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: promptsUrl(created.sessionId),
      payload: { text: "needs auth" },
    })
    expect(response.statusCode).toBe(202)

    const authUpdated = await client.waitFor((message) => message.type === "auth_session_updated")
    expect(authUpdated).toMatchObject({
      type: "auth_session_updated",
      agentId: "cursor",
      auth: { session: { status: "in_progress" } },
    })

    const error = await client.waitFor((message) => message.type === "error")
    expect(error).toMatchObject({
      type: "error",
      message: expect.stringContaining("Agent authentication required"),
    })
    expect(client.messages.some((message) => message.type === "prompt_complete")).toBe(false)

    await client.close()
  }, 30_000)
})

describe("POST /v1/sessions/:sessionId/cancel", () => {
  test("returns 204 and subscribed streams see cancelled", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "cmd-http-cancel",
        sessionLoadSessionId: "cmd-http-cancel",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    await app.listen({ host: config.host, port: 0 })

    const created = await createSession(app, "/tmp/cmd-http-cancel")
    const client = await openStreamClient(boundStreamUrl(app), app.deviceCredential.credential)
    client.send({ type: "subscribe", agentId: "cursor", sessionId: created.sessionId })
    await client.waitFor((message) => message.type === "subscribed")

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: `/v1/sessions/${encodeURIComponent(created.sessionId)}/cancel?agentId=cursor`,
      payload: {},
    })
    expect(response.statusCode).toBe(204)

    await client.waitFor((message) => message.type === "cancelled")

    await client.close()
  }, 30_000)

  test("returns 404 for an unknown session", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/sessions/nope/cancel?agentId=cursor",
      payload: {},
    })

    expect(response.statusCode).toBe(404)
    const problem = NotFoundProblemSchema.parse(JSON.parse(response.body))
    expect(problem.type).toBe(PROBLEM_TYPES.notFound)
  })
})

describe("POST /v1/permissions/:requestId/replies", () => {
  test("first reply wins: 204, then 409, and unknown ids get 404", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "cmd-http-perm",
        sessionLoadSessionId: "cmd-http-perm",
        emitPermissionRequestOnPrompt: true,
        promptCompletionDelayMs: 50,
      },
    })
    await enableAgent(app, "cursor", whichFn)
    await app.listen({ host: config.host, port: 0 })

    const created = await createSession(app, "/tmp/cmd-http-perm")
    const client = await openStreamClient(boundStreamUrl(app), app.deviceCredential.credential)
    client.send({ type: "subscribe", agentId: "cursor", sessionId: created.sessionId })
    await client.waitFor((message) => message.type === "subscribed")

    const promptResponse = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: promptsUrl(created.sessionId),
      payload: { text: "needs permission" },
    })
    expect(promptResponse.statusCode).toBe(202)

    const permission = await client.waitFor((message) => message.type === "permission_request")
    if (permission.type !== "permission_request") {
      throw new Error("expected permission_request")
    }

    const first = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: `/v1/permissions/${encodeURIComponent(permission.requestId)}/replies`,
      payload: { optionId: "allow-once" },
    })
    expect(first.statusCode).toBe(204)

    const second = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: `/v1/permissions/${encodeURIComponent(permission.requestId)}/replies`,
      payload: { optionId: "reject-once" },
    })
    expect(second.statusCode).toBe(409)
    const conflict = ConflictProblemSchema.parse(JSON.parse(second.body))
    expect(conflict.type).toBe(PROBLEM_TYPES.conflict)

    const unknown = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/permissions/req-missing/replies",
      payload: { optionId: "allow-once" },
    })
    expect(unknown.statusCode).toBe(404)
    const notFound = NotFoundProblemSchema.parse(JSON.parse(unknown.body))
    expect(notFound.type).toBe(PROBLEM_TYPES.notFound)

    await client.close()
  }, 30_000)

  test("returns 400 for an empty optionId", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/permissions/req-1/replies",
      payload: { optionId: "" },
    })

    expect(response.statusCode).toBe(400)
    const problem = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(problem.type).toBe(PROBLEM_TYPES.validationError)
  })
})

describe("POST /v1/extensions/:requestId/replies", () => {
  test("returns 404 for an unknown request id", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/extensions/req-missing/replies",
      payload: { result: { ok: true } },
    })

    expect(response.statusCode).toBe(404)
    const problem = NotFoundProblemSchema.parse(JSON.parse(response.body))
    expect(problem.type).toBe(PROBLEM_TYPES.notFound)
  })
})
