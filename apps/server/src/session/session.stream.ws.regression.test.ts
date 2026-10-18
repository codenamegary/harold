import { describe, expect, test } from "bun:test"
import { CreateSessionResponseSchema } from "contracts/http/session"
import {
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  SessionStreamServerMessageSchema,
} from "contracts/http/session.stream"
import { WebSocket } from "ws"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { eventDataText } from "../test/event.data.text"
import { enableAgent } from "../test-support/test.app"
import { bootTestApp } from "../test-support/test.harness"

/**
 * Frozen regression guard for the deprecated WebSocket session stream at
 * `GET /v1/sessions/stream`. The WS route is unchanged until it is deleted;
 * these tests pin its wire behavior during the SSE coexistence window.
 */

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

type WsClient = {
  messages: SessionStreamServerMessage[]
  send: (message: SessionStreamClientMessage) => void
  waitFor: (
    predicate: (message: SessionStreamServerMessage) => boolean,
    timeoutMs?: number,
  ) => Promise<SessionStreamServerMessage>
  close: () => Promise<void>
}

const openWsClient = (wsUrl: string, credential: string): Promise<WsClient> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: { authorization: `Bearer ${credential}` },
    })
    const messages: SessionStreamServerMessage[] = []
    const waiters: Array<{
      predicate: (message: SessionStreamServerMessage) => boolean
      resolve: (message: SessionStreamServerMessage) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }> = []

    const notify = (message: SessionStreamServerMessage) => {
      messages.push(message)
      for (const waiter of waiters.filter((candidate) => candidate.predicate(message))) {
        clearTimeout(waiter.timer)
        waiters.splice(waiters.indexOf(waiter), 1)
        waiter.resolve(message)
      }
    }

    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout opening ws session stream"))
    }, 5_000)

    ws.addEventListener("open", () => {
      clearTimeout(timer)
      resolve({
        messages,
        send: (message) => {
          ws.send(JSON.stringify(message))
        },
        waitFor: (predicate, timeoutMs = 5_000) =>
          new Promise((waitResolve, waitReject) => {
            const existing = messages.find(predicate)
            if (existing !== undefined) {
              waitResolve(existing)
              return
            }
            const waiterTimer = setTimeout(() => {
              waitReject(new Error("timeout waiting for ws stream message"))
            }, timeoutMs)
            waiters.push({
              predicate,
              resolve: waitResolve,
              reject: waitReject,
              timer: waiterTimer,
            })
          }),
        close: () =>
          new Promise((closeResolve) => {
            if (ws.readyState === WebSocket.CLOSED) {
              closeResolve()
              return
            }
            ws.addEventListener("close", () => closeResolve())
            ws.close()
          }),
      })
    })

    ws.addEventListener("message", (event) => {
      notify(SessionStreamServerMessageSchema.parse(JSON.parse(eventDataText(event.data))))
    })

    ws.addEventListener("unexpected-response", (_req, res) => {
      clearTimeout(timer)
      reject(new Error(`unexpected response ${res.statusCode}`))
    })
  })

describe("ws session stream regression", () => {
  test("prompt frames still drive prompt_complete over the WS stream", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "ws-reg-1",
        sessionLoadSessionId: "ws-reg-1",
        promptCompletionDelayMs: 50,
      },
    })
    await enableAgent(app, "cursor", whichFn)
    await app.listen({ host: config.host, port: 0 })
    const address = app.server.address()
    if (address === null || typeof address !== "object" || !("port" in address)) {
      throw new Error("expected bound server address")
    }
    const wsUrl = `ws://${config.host}:${address.port}/v1/sessions/stream`

    const createResponse = await app.inject({
      headers: { authorization: `Bearer ${app.deviceCredential.credential}` },
      method: "POST",
      url: "/v1/sessions",
      payload: { agentId: "cursor", cwd: "/tmp/ws-reg" },
    })
    expect(createResponse.statusCode).toBe(201)
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

    const client = await openWsClient(wsUrl, app.deviceCredential.credential)
    client.send({ type: "subscribe", agentId: "cursor", sessionId: created.sessionId })
    await client.waitFor((message) => message.type === "subscribed")

    client.send({
      type: "prompt",
      agentId: "cursor",
      sessionId: created.sessionId,
      text: "hello ws",
    })
    await client.waitFor((message) => message.type === "prompt_complete")
    expect(client.messages.some((message) => message.type === "error")).toBe(false)

    await client.close()
  }, 30_000)

  test("prompt and cancel without a subscription error with Not subscribed to session", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "ws-reg-unsub-1",
        sessionLoadSessionId: "ws-reg-unsub-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    await app.listen({ host: config.host, port: 0 })
    const address = app.server.address()
    if (address === null || typeof address !== "object" || !("port" in address)) {
      throw new Error("expected bound server address")
    }
    const wsUrl = `ws://${config.host}:${address.port}/v1/sessions/stream`

    const createResponse = await app.inject({
      headers: { authorization: `Bearer ${app.deviceCredential.credential}` },
      method: "POST",
      url: "/v1/sessions",
      payload: { agentId: "cursor", cwd: "/tmp/ws-reg-unsub" },
    })
    expect(createResponse.statusCode).toBe(201)
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

    const client = await openWsClient(wsUrl, app.deviceCredential.credential)

    client.send({
      type: "prompt",
      agentId: "cursor",
      sessionId: created.sessionId,
      text: "no subscription yet",
    })
    const promptError = await client.waitFor((message) => message.type === "error")
    expect(promptError).toMatchObject({
      type: "error",
      message: "Not subscribed to session",
    })

    client.send({ type: "cancel", agentId: "cursor", sessionId: created.sessionId })
    await client.waitFor(
      (message) =>
        message.type === "error" && client.messages.filter((m) => m.type === "error").length >= 2,
    )

    expect(client.messages.some((message) => message.type === "prompt_complete")).toBe(false)
    expect(client.messages.some((message) => message.type === "cancelled")).toBe(false)

    await client.close()
  }, 30_000)

  test("a gated prompt reports the auth error on the WS stream", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "ws-reg-auth-1",
        sessionLoadSessionId: "ws-reg-auth-1",
        promptFailsWithAuthRequired: true,
      },
    })
    await enableAgent(app, "cursor", whichFn)
    await app.listen({ host: config.host, port: 0 })
    const address = app.server.address()
    if (address === null || typeof address !== "object" || !("port" in address)) {
      throw new Error("expected bound server address")
    }
    const wsUrl = `ws://${config.host}:${address.port}/v1/sessions/stream`

    const createResponse = await app.inject({
      headers: { authorization: `Bearer ${app.deviceCredential.credential}` },
      method: "POST",
      url: "/v1/sessions",
      payload: { agentId: "cursor", cwd: "/tmp/ws-reg-auth" },
    })
    expect(createResponse.statusCode).toBe(201)
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

    const client = await openWsClient(wsUrl, app.deviceCredential.credential)
    client.send({ type: "subscribe", agentId: "cursor", sessionId: created.sessionId })
    await client.waitFor((message) => message.type === "subscribed")

    client.send({
      type: "prompt",
      agentId: "cursor",
      sessionId: created.sessionId,
      text: "needs auth",
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
