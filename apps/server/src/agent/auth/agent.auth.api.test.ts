import { describe, expect, test } from "bun:test"
import {
  AgentAuthSchema,
  AgentAuthSessionSchema,
  AgentAuthSummarySchema,
  agentAuthLogoutPath,
  agentAuthPath,
  agentAuthSessionActionsPath,
  agentAuthSessionsPath,
} from "contracts/http/agent-auth"
import { ConflictProblemSchema } from "contracts/http/error"
import { bootTestApp } from "../../test-support/test.harness"
import { enableAgent } from "../../test-support/test.app"
import { HOST_LOGIN_CONFIRM_STEP_ID } from "./adapters/default.adapter"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

describe("agent auth HTTP routes", () => {
  test(
    "runs full session lifecycle and blocks logout while in flight",
    async () => {
      const { app } = await bootTestApp()
      const agentId = "gemini"

      const startResponse = await app.inject({
        headers: authHeaders(app),
        method: "POST",
        url: agentAuthSessionsPath(agentId),
        payload: {},
      })
      if (startResponse.statusCode !== 201) {
        throw new Error(`start failed: ${startResponse.statusCode} ${startResponse.body}`)
      }
      const started = AgentAuthSessionSchema.parse(JSON.parse(startResponse.body))
      expect(started.status).toBe("in_progress")

      const logoutBlocked = await app.inject({
        headers: authHeaders(app),
        method: "POST",
        url: agentAuthLogoutPath(agentId),
      })
      const blockedBody = ConflictProblemSchema.parse(JSON.parse(logoutBlocked.body))
      expect(logoutBlocked.statusCode).toBe(409)
      expect(blockedBody.title).toBe("Auth session in progress")

      await enableAgent(app, agentId)

      const confirmResponse = await app.inject({
        headers: authHeaders(app),
        method: "POST",
        url: agentAuthSessionActionsPath(agentId, started.sessionId),
        payload: { type: "confirm", stepId: HOST_LOGIN_CONFIRM_STEP_ID },
      })
      if (confirmResponse.statusCode !== 200) {
        throw new Error(`confirm failed: ${confirmResponse.statusCode} ${confirmResponse.body}`)
      }
      const confirmed = AgentAuthSessionSchema.parse(JSON.parse(confirmResponse.body))
      expect(confirmed.status).toBe("succeeded")

      const authResponse = await app.inject({
        headers: authHeaders(app),
        method: "GET",
        url: agentAuthPath(agentId),
      })
      const auth = AgentAuthSchema.parse(JSON.parse(authResponse.body))
      expect(authResponse.statusCode).toBe(200)
      expect(auth.session).toBeNull()

      const logoutResponse = await app.inject({
        headers: authHeaders(app),
        method: "POST",
        url: agentAuthLogoutPath(agentId),
      })
      const summary = AgentAuthSummarySchema.parse(JSON.parse(logoutResponse.body))
      expect(logoutResponse.statusCode).toBe(200)
      expect(summary.canLogout).toBe(false)
    },
    { timeout: 30_000 },
  )

  test("returns auth summary on agent settings list", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/settings/agents",
    })

    const body = JSON.parse(response.body) as {
      items: Array<{ id: string; authSummary: unknown }>
    }
    const cursor = body.items.find((item) => item.id === "cursor")
    expect(cursor?.authSummary).toEqual({
      status: "unknown",
      error: null,
      activeSessionId: null,
      canLogout: false,
    })
  })
})
