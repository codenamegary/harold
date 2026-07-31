import { afterEach, describe, expect, test } from "bun:test"
import { spawnFakeAcp } from "./spawn.fake.acp"
import { createJsonRpcClient } from "./json.rpc.client"

const spawnedProcesses: Array<{ kill: () => void }> = []

afterEach(() => {
  spawnedProcesses.splice(0).forEach((process) => process.kill())
})

describe("spawnFakeAcp", () => {
  test("runs the fake ACP binary with custom capabilities", async () => {
    const fake = spawnFakeAcp({
      capabilities: { loadSession: true, sessionClose: true },
    })
    spawnedProcesses.push(fake)

    const client = createJsonRpcClient(fake.stdin, fake.stdout)
    const init = await client.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "integration-test", version: "0.0.0" },
    })

    expect(init).toEqual({
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { close: true },
      },
      agentInfo: { name: "fake-acp", version: "0.0.0" },
      authMethods: [],
    })
  })

  test("supports initialize through session/close lifecycle", async () => {
    const fake = spawnFakeAcp({
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "lifecycle-session",
      sessionLoadSessionId: "lifecycle-session",
    })
    spawnedProcesses.push(fake)

    const client = createJsonRpcClient(fake.stdin, fake.stdout)

    await client.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "integration-test", version: "0.0.0" },
    })
    await client.request("authenticate", { methodId: "cursor_login" })

    const created = await client.request<{ sessionId: string }>("session/new", {
      cwd: "/tmp",
      mcpServers: [],
    })
    expect(created.sessionId).toBe("lifecycle-session")

    const loaded = await client.request<{ sessionId: string }>("session/load", {
      sessionId: "lifecycle-session",
      cwd: "/tmp",
      mcpServers: [],
    })
    expect(loaded.sessionId).toBe("lifecycle-session")

    await client.request("session/close", { sessionId: "lifecycle-session" })
  })

  test("uses newline-delimited JSON-RPC framing over stdio", async () => {
    const fake = spawnFakeAcp({})
    spawnedProcesses.push(fake)

    const requestLine = `${JSON.stringify({
      jsonrpc: "2.0",
      id: 42,
      method: "initialize",
      params: {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "framing-test", version: "0.0.0" },
      },
    })}\n`

    fake.stdin.write(requestLine)

    const reader = fake.stdout.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []
    const responseLine = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timed out waiting for response")), 5000)
      const read = async () => {
        const { done, value } = await reader.read()
        if (done) {
          clearTimeout(timeout)
          reject(new Error("stream ended before response"))
          return
        }
        chunks.push(decoder.decode(value, { stream: true }))
        const text = chunks.join("")
        const newlineIndex = text.indexOf("\n")
        if (newlineIndex !== -1) {
          clearTimeout(timeout)
          resolve(text.slice(0, newlineIndex + 1))
          return
        }
        await read()
      }
      void read()
    })

    expect(responseLine.endsWith("\n")).toBe(true)
    expect(JSON.parse(responseLine.trim())).toMatchObject({
      jsonrpc: "2.0",
      id: 42,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: false,
          sessionCapabilities: { close: false },
        },
      },
    })
  })

  test("handles permission requests emitted by the fake", async () => {
    const fake = spawnFakeAcp({
      emitPermissionRequest: true,
      sessionNewSessionId: "permission-session",
    })
    spawnedProcesses.push(fake)

    const client = createJsonRpcClient(fake.stdin, fake.stdout)
    await client.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "integration-test", version: "0.0.0" },
    })

    const permissionPromise = client.waitForRequest("session/request_permission")
    await client.request("session/new", { cwd: "/tmp", mcpServers: [] })

    const permissionRequest = await permissionPromise
    expect(permissionRequest.params).toMatchObject({
      sessionId: "permission-session",
      options: [{ optionId: "allow-once", name: "Allow once" }],
    })

    await client.respond(permissionRequest.id, {
      outcome: { outcome: "selected", optionId: "allow-once" },
    })
  })

  test("overlapping prompts on two sessions complete independently", async () => {
    const fake = spawnFakeAcp({
      emitSessionUpdatesOnPrompt: true,
    })
    spawnedProcesses.push(fake)

    const client = createJsonRpcClient(fake.stdin, fake.stdout)
    await client.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "integration-test", version: "0.0.0" },
    })

    const first = await client.request<{ sessionId: string }>("session/new", {
      cwd: "/tmp",
      mcpServers: [],
    })
    const second = await client.request<{ sessionId: string }>("session/new", {
      cwd: "/tmp",
      mcpServers: [],
    })
    expect(first.sessionId).not.toBe(second.sessionId)

    const promptA = client.request<{ stopReason: string }>("session/prompt", {
      sessionId: first.sessionId,
      prompt: [{ type: "text", text: "hello a" }],
    })
    const promptB = client.request<{ stopReason: string }>("session/prompt", {
      sessionId: second.sessionId,
      prompt: [{ type: "text", text: "hello b" }],
    })

    fake.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        method: "session/cancel",
        params: { sessionId: first.sessionId },
      })}\n`,
    )

    const [resultA, resultB] = await Promise.all([promptA, promptB])
    expect(resultA.stopReason).toBe("cancelled")
    expect(resultB.stopReason).toBe("end_turn")
  })

  test("two overlapping prompts both complete naturally", async () => {
    const fake = spawnFakeAcp({
      emitSessionUpdatesOnPrompt: true,
    })
    spawnedProcesses.push(fake)

    const client = createJsonRpcClient(fake.stdin, fake.stdout)
    await client.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "integration-test", version: "0.0.0" },
    })

    const first = await client.request<{ sessionId: string }>("session/new", {
      cwd: "/tmp",
      mcpServers: [],
    })
    const second = await client.request<{ sessionId: string }>("session/new", {
      cwd: "/tmp",
      mcpServers: [],
    })

    const [resultA, resultB] = await Promise.all([
      client.request<{ stopReason: string }>("session/prompt", {
        sessionId: first.sessionId,
        prompt: [{ type: "text", text: "hello a" }],
      }),
      client.request<{ stopReason: string }>("session/prompt", {
        sessionId: second.sessionId,
        prompt: [{ type: "text", text: "hello b" }],
      }),
    ])

    expect(resultA.stopReason).toBe("end_turn")
    expect(resultB.stopReason).toBe("end_turn")
  })
})
