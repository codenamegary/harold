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
})
