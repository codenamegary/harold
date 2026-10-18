import { describe, expect, test } from "bun:test"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { openSseStream } from "test-support/session-stream"
import { Config } from "../config/config"
import { enableAgent } from "../test-support/test.app"
import { bootTestApp } from "../test-support/test.harness"

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

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
  }
}

const eventsUrl = (httpBase: string, sessionId: string) =>
  `${httpBase}/v1/sessions/${encodeURIComponent(sessionId)}/events?agentId=cursor`

describe("session hub config stream integration", () => {
  test("session/load delivers config to the joiner and a PUT fans the new state to every subscriber", async () => {
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
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "config-stream-1",
        sessionLoadSessionId: "config-stream-1",
        configOptions: fakeConfigOptions,
      },
    })
    await enableAgent(app, "cursor", whichFn)

    const { httpBase } = await getListeningBase(app, config)

    const createResponse = await fetch(`${httpBase}/v1/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({
        agentId: "cursor",
        cwd: "/tmp/config-stream-project",
      }),
    })
    expect(createResponse.status).toBe(201)
    const created = CreateSessionResponseSchema.parse(await createResponse.json())

    const subscriber = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
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
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${app.deviceCredential.credential}`,
        },
        body: JSON.stringify({ value: "m2" }),
      },
    )
    expect(putResponse.status).toBe(202)
    expect(await putResponse.text()).toBe("")

    const updated = await subscriber.waitFor(
      (message) =>
        message.type === "session_config" &&
        message.configOptions.some(
          (option) =>
            option.id === "model" && option.type === "select" && option.currentValue === "m2",
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
