import { describe, expect, test } from "bun:test"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { enableAgent } from "./test.app"
import { bootTestApp } from "./test.harness"
import {
  createSmokeLogCapture,
  drainPrompt,
  openStreamClient,
  smokeCommands,
} from "./session.stream.smoke"

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

describe("session stream smoke machinery", () => {
  test("drainPrompt answers permission requests over SSE and REST", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "smoke-machinery-1",
        sessionLoadSessionId: "smoke-machinery-1",
        emitPermissionRequestOnPrompt: true,
        promptCompletionDelayMs: 50,
      },
    })
    await enableAgent(app, "cursor", whichFn)
    await app.listen({ host: config.host, port: 0 })

    const createResponse = await app.inject({
      headers: { authorization: `Bearer ${app.deviceCredential.credential}` },
      method: "POST",
      url: "/v1/sessions",
      payload: { agentId: "cursor", cwd: "/tmp/smoke-machinery" },
    })
    expect(createResponse.statusCode).toBe(201)
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

    const client = await openStreamClient({
      app,
      credential: app.deviceCredential.credential,
      agentId: "cursor",
      sessionId: created.sessionId,
    })
    const commands = smokeCommands({ app, credential: app.deviceCredential.credential })
    await client.waitFor((message) => message.type === "subscribed")

    const promptResponse = await commands.prompt({
      agentId: "cursor",
      sessionId: created.sessionId,
      text: "hello smoke machinery",
    })
    expect(promptResponse.status).toBe(202)

    await drainPrompt({
      logCapture: createSmokeLogCapture(),
      client,
      commands,
      deadlineMs: Date.now() + 10_000,
    })

    expect(client.messages.some((message) => message.type === "error")).toBe(false)
    expect(client.messages.some((message) => message.type === "prompt_complete")).toBe(true)

    await client.close()
  }, 30_000)
})
