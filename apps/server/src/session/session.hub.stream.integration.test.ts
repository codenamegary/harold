import { afterEach, describe, expect, test } from "bun:test"
import {
  CreateSessionResponseSchema,
} from "contracts/http/session"
import {
  SessionStreamClientMessage,
  SessionStreamServerMessage,
  SessionStreamServerMessageSchema,
} from "contracts/http/session.stream"
import { WebSocket } from "ws"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { Config } from "../config/config"
import { eventDataText } from "../test/event.data.text"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
} from "../test-support/create-test-app"

const resources = createTestAppResources()

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

const getListeningBase = async (
  app: {
    listen: (opts: { host: string; port: number }) => Promise<string>
    server: { address: () => unknown }
  },
  config: Config,
) => {
  await app.listen({ host: config.host, port: 0 })
  const address = app.server.address()
  if (address === null || typeof address === "string") {
    throw new Error("expected bound server address")
  }

  return {
    httpBase: `http://${config.host}:${address.port}`,
    wsUrl: `ws://${config.host}:${address.port}/v1/sessions/stream`,
  }
}

type StreamClient = {
  ws: WebSocket
  messages: SessionStreamServerMessage[]
  waitFor: (
    predicate: (message: SessionStreamServerMessage) => boolean,
    timeoutMs?: number,
  ) => Promise<SessionStreamServerMessage>
  send: (message: SessionStreamClientMessage) => void
  close: () => Promise<void>
}

const openStreamClient = (wsUrl: string): Promise<StreamClient> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const messages: SessionStreamServerMessage[] = []
    const waiters: Array<{
      predicate: (message: SessionStreamServerMessage) => boolean
      resolve: (message: SessionStreamServerMessage) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }> = []

    const notify = (message: SessionStreamServerMessage) => {
      messages.push(message)
      const matched = waiters.filter((waiter) => waiter.predicate(message))
      for (const waiter of matched) {
        clearTimeout(waiter.timer)
        const index = waiters.indexOf(waiter)
        if (index >= 0) {
          waiters.splice(index, 1)
        }
        waiter.resolve(message)
      }
    }

    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout opening session stream"))
    }, 5_000)

    ws.addEventListener("open", () => {
      clearTimeout(timer)
      resolve({
        ws,
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
              waitReject(new Error("timeout waiting for stream message"))
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

describe("session hub stream integration", () => {
  test("two clients mirror load replay, live updates, prompt/cancel, and permission first-wins", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "hub-stream-1",
      sessionLoadSessionId: "hub-stream-1",
      emitLoadReplayUpdates: true,
      emitSessionUpdatesOnPrompt: true,
      emitPermissionRequestOnPrompt: true,
      promptCompletionDelayMs: 200,
    })
    await enableAgent(app, "cursor", whichFn)

    const { httpBase, wsUrl } = await getListeningBase(app, config)

    const createResponse = await fetch(`${httpBase}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "cursor",
        cwd: "/tmp/hub-stream-project",
      }),
    })
    expect(createResponse.status).toBe(201)
    const created = CreateSessionResponseSchema.parse(await createResponse.json())
    expect(created.sessionId).toBe("hub-stream-1")

    const clientA = await openStreamClient(wsUrl)
    const clientB = await openStreamClient(wsUrl)

    clientA.send({
      type: "subscribe",
      agentId: "cursor",
      sessionId: created.sessionId,
    })

    const subscribedA = await clientA.waitFor((message) => message.type === "subscribed")
    expect(subscribedA).toMatchObject({
      type: "subscribed",
      agentId: "cursor",
      sessionId: created.sessionId,
    })
    expect(clientA.messages.some((message) => message.type === "error")).toBe(false)

    clientB.send({
      type: "subscribe",
      agentId: "cursor",
      sessionId: created.sessionId,
    })
    await clientB.waitFor((message) => message.type === "subscribed")
    expect(clientB.messages.some((message) => message.type === "error")).toBe(false)

    const liveBeforeA = clientA.messages.filter((m) => m.type === "session_update").length
    const liveBeforeB = clientB.messages.filter((m) => m.type === "session_update").length

    clientA.send({
      type: "prompt",
      agentId: "cursor",
      sessionId: created.sessionId,
      text: "hello hub",
    })

    const permissionA = await clientA.waitFor((message) => message.type === "permission_request")
    const permissionB = await clientB.waitFor((message) => message.type === "permission_request")
    expect(permissionA.type).toBe("permission_request")
    expect(permissionB.type).toBe("permission_request")
    if (permissionA.type !== "permission_request" || permissionB.type !== "permission_request") {
      throw new Error("expected permission_request")
    }
    expect(permissionA.requestId).toBe(permissionB.requestId)

    clientA.send({
      type: "permission_reply",
      requestId: permissionA.requestId,
      optionId: "allow-once",
    })
    clientB.send({
      type: "permission_reply",
      requestId: permissionB.requestId,
      optionId: "reject-once",
    })

    await clientA.waitFor(
      (message) =>
        message.type === "session_update" &&
        clientA.messages.filter((m) => m.type === "session_update").length > liveBeforeA,
    )
    await clientB.waitFor(
      (message) =>
        message.type === "session_update" &&
        clientB.messages.filter((m) => m.type === "session_update").length > liveBeforeB,
    )

    expect(
      clientA.messages.filter((m) => m.type === "session_update").length,
    ).toBeGreaterThan(liveBeforeA)
    expect(
      clientB.messages.filter((m) => m.type === "session_update").length,
    ).toBeGreaterThan(liveBeforeB)

    clientA.send({
      type: "cancel",
      agentId: "cursor",
      sessionId: created.sessionId,
    })

    await clientA.close()
    await clientB.close()
  })

  test("subscribe after session/new succeeds even when session/load fails", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "hub-stream-new-1",
      sessionLoadFails: true,
      emitSessionUpdatesOnPrompt: true,
      promptCompletionDelayMs: 50,
    })
    await enableAgent(app, "cursor", whichFn)

    const { httpBase, wsUrl } = await getListeningBase(app, config)

    const createResponse = await fetch(`${httpBase}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "cursor",
        cwd: "/tmp/hub-stream-new-project",
      }),
    })
    expect(createResponse.status).toBe(201)
    const created = CreateSessionResponseSchema.parse(await createResponse.json())

    const client = await openStreamClient(wsUrl)
    client.send({
      type: "subscribe",
      agentId: "cursor",
      sessionId: created.sessionId,
    })

    const subscribed = await client.waitFor(
      (message) => message.type === "subscribed" || message.type === "error",
    )
    expect(subscribed).toMatchObject({
      type: "subscribed",
      agentId: "cursor",
      sessionId: created.sessionId,
    })

    client.send({
      type: "prompt",
      agentId: "cursor",
      sessionId: created.sessionId,
      text: "hello new session",
    })

    await client.waitFor((message) => message.type === "prompt_complete")
    expect(client.messages.some((message) => message.type === "error")).toBe(false)

    await client.close()
  })
})
