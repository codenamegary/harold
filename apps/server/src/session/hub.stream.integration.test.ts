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

  test("re-subscribe to a live session replays history", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "hub-resub-1",
      sessionLoadSessionId: "hub-resub-1",
      emitLoadReplayUpdates: true,
    })
    await enableAgent(app, "cursor", whichFn)

    const { httpBase, wsUrl } = await getListeningBase(app, config)

    const createResponse = await fetch(`${httpBase}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "cursor",
        cwd: "/tmp/hub-resub-project",
      }),
    })
    expect(createResponse.status).toBe(201)
    const created = CreateSessionResponseSchema.parse(await createResponse.json())

    const firstClient = await openStreamClient(wsUrl)
    firstClient.send({
      type: "subscribe",
      agentId: "cursor",
      sessionId: created.sessionId,
    })
    await firstClient.waitFor((message) => message.type === "subscribed")
    await firstClient.close()

    const secondClient = await openStreamClient(wsUrl)
    secondClient.send({
      type: "subscribe",
      agentId: "cursor",
      sessionId: created.sessionId,
    })

    const replayUpdate = await secondClient.waitFor(
      (message) =>
        message.type === "session_update" &&
        JSON.stringify(message.update).includes("Replayed"),
    )
    expect(replayUpdate.type).toBe("session_update")

    const subscribed = await secondClient.waitFor((message) => message.type === "subscribed")
    expect(subscribed).toMatchObject({
      type: "subscribed",
      agentId: "cursor",
      sessionId: created.sessionId,
    })

    const subscribedIndex = secondClient.messages.findIndex(
      (message) => message.type === "subscribed",
    )
    const replayIndex = secondClient.messages.findIndex(
      (message) => message === replayUpdate,
    )
    expect(replayIndex).toBeLessThan(subscribedIndex)

    await secondClient.close()
  })

  test("two clients receive auth_session_updated when one starts host-login", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "auth-fanout-1",
      sessionLoadSessionId: "auth-fanout-1",
    })
    await enableAgent(app, "cursor", whichFn)

    const { httpBase, wsUrl } = await getListeningBase(app, config)

    const createResponse = await fetch(`${httpBase}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "cursor",
        cwd: "/tmp/auth-fanout",
      }),
    })
    expect(createResponse.status).toBe(201)
    const created = CreateSessionResponseSchema.parse(await createResponse.json())

    const clientA = await openStreamClient(wsUrl)
    const clientB = await openStreamClient(wsUrl)

    clientA.send({
      type: "subscribe",
      agentId: "cursor",
      sessionId: created.sessionId,
    })
    clientB.send({
      type: "subscribe",
      agentId: "cursor",
      sessionId: created.sessionId,
    })
    await clientA.waitFor((message) => message.type === "subscribed")
    await clientB.waitFor((message) => message.type === "subscribed")

    const startResponse = await fetch(`${httpBase}/v1/agents/cursor/auth/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    expect(startResponse.status).toBe(201)

    const authA = await clientA.waitFor((message) => message.type === "auth_session_updated")
    const authB = await clientB.waitFor((message) => message.type === "auth_session_updated")
    expect(authA).toMatchObject({
      type: "auth_session_updated",
      agentId: "cursor",
      auth: { agentId: "cursor", session: { status: "in_progress" } },
    })
    expect(authB).toMatchObject({
      type: "auth_session_updated",
      agentId: "cursor",
    })

    await clientA.close()
    await clientB.close()
  }, { timeout: 30_000 })

  test("prompt auth_required opens host-login and errors without prompt_complete", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "auth-prompt-1",
      sessionLoadSessionId: "auth-prompt-1",
      promptFailsWithAuthRequired: true,
    })
    await enableAgent(app, "cursor", whichFn)

    const { httpBase, wsUrl } = await getListeningBase(app, config)

    const createResponse = await fetch(`${httpBase}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "cursor",
        cwd: "/tmp/auth-prompt",
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
    await client.waitFor((message) => message.type === "subscribed")

    client.send({
      type: "prompt",
      agentId: "cursor",
      sessionId: created.sessionId,
      text: "needs auth",
    })

    const authUpdated = await client.waitFor(
      (message) => message.type === "auth_session_updated",
    )
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
    expect(client.messages.some((message) => message.type === "prompt_complete")).toBe(
      false,
    )

    await client.close()
  }, { timeout: 30_000 })

  test("session/new auth_required opens host-login and returns 409", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewFailsWithAuthRequired: true,
    })
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        agentId: "cursor",
        cwd: "/tmp/auth-create",
      },
    })
    expect(createResponse.statusCode).toBe(409)
    expect(JSON.parse(createResponse.body).title).toBe("Agent authentication required")

    const authResponse = await app.inject({
      method: "GET",
      url: "/v1/agents/cursor/auth",
    })
    expect(authResponse.statusCode).toBe(200)
    const auth = JSON.parse(authResponse.body) as {
      session: { status: string } | null
    }
    expect(auth.session?.status).toBe("in_progress")
  }, { timeout: 30_000 })

  test("subscribe after session/new receives cached available commands", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "hub-cmds-1",
      sessionLoadSessionId: "hub-cmds-1",
      emitAvailableCommandsOnNew: true,
    })
    await enableAgent(app, "cursor", whichFn)

    const { httpBase, wsUrl } = await getListeningBase(app, config)

    const createResponse = await fetch(`${httpBase}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "cursor",
        cwd: "/tmp/hub-cmds-project",
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

    const commandsUpdate = await client.waitFor(
      (message) =>
        message.type === "session_update" &&
        JSON.stringify(message.update).includes("available_commands_update"),
    )
    expect(commandsUpdate).toMatchObject({
      type: "session_update",
      agentId: "cursor",
      sessionId: created.sessionId,
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          {
            name: "web",
            description: "Search the web",
            input: { hint: "query" },
          },
        ],
      },
    })

    const subscribed = await client.waitFor((message) => message.type === "subscribed")
    expect(subscribed).toMatchObject({
      type: "subscribed",
      agentId: "cursor",
      sessionId: created.sessionId,
    })

    const subscribedIndex = client.messages.findIndex(
      (message) => message.type === "subscribed",
    )
    const commandsIndex = client.messages.findIndex((message) => message === commandsUpdate)
    expect(commandsIndex).toBeLessThan(subscribedIndex)

    await client.close()
  })
})
