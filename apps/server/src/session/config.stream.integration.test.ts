import { afterEach, describe, expect, test } from "bun:test"
import { CreateSessionResponseSchema } from "contracts/http/session"
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

describe("session config stream integration", () => {
  test("session/load delivers config to the joiner and a PUT fans the new state to every subscriber", async () => {
    const dataDir = await createTempDataDir(resources)
    const fakeConfigOptions = [
      {
        id: "model",
        name: "Model",
        description: "Select the model for this session",
        category: "model",
        type: "select",
        currentValue: "m1",
        options: [
          { value: "m1", name: "M1", description: null },
          { value: "m2", name: "M2", description: "The second model" },
        ],
      },
      {
        id: "thought_level",
        name: "Thinking",
        description: "Set the reasoning effort for this session",
        category: "thought_level",
        type: "select",
        currentValue: "medium",
        options: [
          { value: "low", name: "Thinking: low", description: null },
          { value: "medium", name: "Thinking: medium", description: null },
        ],
      },
    ]
    const { app, config } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "config-stream-1",
      sessionLoadSessionId: "config-stream-1",
      configOptions: fakeConfigOptions,
    })
    await enableAgent(app, "cursor", whichFn)

    const { httpBase, wsUrl } = await getListeningBase(app, config)

    const createResponse = await fetch(`${httpBase}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "cursor",
        cwd: "/tmp/config-stream-project",
      }),
    })
    expect(createResponse.status).toBe(201)
    const created = CreateSessionResponseSchema.parse(await createResponse.json())

    const subscriber = await openStreamClient(wsUrl)
    subscriber.send({
      type: "subscribe",
      agentId: "cursor",
      sessionId: created.sessionId,
    })
    await subscriber.waitFor((message) => message.type === "subscribed")

    const loaded = subscriber.messages.find((message) => message.type === "session_config")
    expect(loaded).toMatchObject({
      type: "session_config",
      agentId: "cursor",
      sessionId: created.sessionId,
      configOptions: fakeConfigOptions,
    })

    const putResponse = await fetch(
      `${httpBase}/v1/sessions/${created.sessionId}/config-options/model?agentId=cursor`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "m2" }),
      },
    )
    expect(putResponse.status).toBe(202)
    expect(await putResponse.text()).toBe("")

    const updated = await subscriber.waitFor(
      (message) =>
        message.type === "session_config"
        && message.configOptions.some(
          (option) => option.id === "model"
            && option.type === "select"
            && option.currentValue === "m2",
        ),
    )
    expect(updated).toMatchObject({
      type: "session_config",
      agentId: "cursor",
      sessionId: created.sessionId,
    })

    await subscriber.close()
  })
})
