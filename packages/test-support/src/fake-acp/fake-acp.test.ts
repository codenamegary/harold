import { describe, expect, test } from "bun:test"
import { readFakeAcpConfig } from "./config"
import { handleJsonRpcRequest } from "./handlers"
import { createFakeAcpPromptState } from "./prompt-state"
import { parseJsonRpcLine, serializeJsonRpcMessage } from "./protocol"

const createPromptState = () => createFakeAcpPromptState()

describe("fake ACP protocol", () => {
  test("serializes one JSON-RPC message per line", () => {
    const line = serializeJsonRpcMessage({
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true },
    })

    expect(line.endsWith("\n")).toBe(true)
    expect(parseJsonRpcLine(line)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true },
    })
  })

  test("initialize returns configured capabilities", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_LOAD_SESSION: "true",
      FAKE_ACP_SESSION_CLOSE: "true",
    })

    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: 1,
          clientCapabilities: {},
          clientInfo: { name: "test-client", version: "0.0.0" },
        },
      },
      config,
      createPromptState(),
    )

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 0,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { close: true },
        },
        agentInfo: { name: "fake-acp", version: "0.0.0" },
        authMethods: [],
      },
    })
  })

  test("authenticate returns success", () => {
    const config = readFakeAcpConfig({})

    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "authenticate",
        params: { methodId: "cursor_login" },
      },
      config,
      createPromptState(),
    )

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {},
    })
  })

  test("session/new returns a session id", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_SESSION_NEW_SESSION_ID: "session-test-1",
    })

    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "session/new",
        params: { cwd: "/tmp", mcpServers: [] },
      },
      config,
      createPromptState(),
    )

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { sessionId: "session-test-1" },
    })
  })

  test("session/load is rejected when loadSession is disabled", () => {
    const config = readFakeAcpConfig({ FAKE_ACP_LOAD_SESSION: "false" })

    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "session/load",
        params: { sessionId: "session-test-1", cwd: "/tmp", mcpServers: [] },
      },
      config,
      createPromptState(),
    )

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32601, message: "loadSession not supported" },
    })
  })

  test("session/load succeeds when loadSession is enabled", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_LOAD_SESSION: "true",
      FAKE_ACP_SESSION_LOAD_SESSION_ID: "session-test-1",
    })

    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "session/load",
        params: { sessionId: "session-test-1", cwd: "/tmp", mcpServers: [] },
      },
      config,
      createPromptState(),
    )

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 4,
      result: { sessionId: "session-test-1" },
    })
  })

  test("session/close is rejected when close capability is disabled", () => {
    const config = readFakeAcpConfig({ FAKE_ACP_SESSION_CLOSE: "false" })

    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "session/close",
        params: { sessionId: "session-test-1" },
      },
      config,
      createPromptState(),
    )

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 5,
      error: { code: -32601, message: "session close not supported" },
    })
  })

  test("session/close succeeds when close capability is enabled", () => {
    const config = readFakeAcpConfig({ FAKE_ACP_SESSION_CLOSE: "true" })

    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "session/close",
        params: { sessionId: "session-test-1" },
      },
      config,
      createPromptState(),
    )

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 6,
      result: {},
    })
  })

  test("session/new can emit a permission request", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_EMIT_PERMISSION_REQUEST: "true",
      FAKE_ACP_SESSION_NEW_SESSION_ID: "session-test-1",
    })

    const { response, outbound } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "session/new",
        params: { cwd: "/tmp", mcpServers: [] },
      },
      config,
      createPromptState(),
    )

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 7,
      result: { sessionId: "session-test-1" },
    })
    expect(outbound).toEqual([
      {
        jsonrpc: "2.0",
        id: 1000,
        method: "session/request_permission",
        params: {
          sessionId: "session-test-1",
          options: [{ optionId: "allow-once", name: "Allow once" }],
          toolCall: { toolCallId: "tool-call-permission", name: "fake-tool" },
        },
      },
    ])
  })

  test("session/prompt returns a result and emits scripted updates when enabled", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_EMIT_SESSION_UPDATES_ON_PROMPT: "true",
    })
    const promptState = createPromptState()

    const { response, notifications, deferredNotifications } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "session/prompt",
        params: {
          sessionId: "session-test-1",
          prompt: [{ type: "text", text: "hello" }],
        },
      },
      config,
      promptState,
    )

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 8,
      result: { stopReason: "end_turn" },
    })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.method).toBe("session/update")
    expect(deferredNotifications).toHaveLength(2)
  })

  test("session/cancel marks the active prompt as cancelled", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_EMIT_SESSION_UPDATES_ON_PROMPT: "true",
    })
    const promptState = createPromptState()

    handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "session/prompt",
        params: {
          sessionId: "session-test-1",
          prompt: [{ type: "text", text: "hello" }],
        },
      },
      config,
      promptState,
    )

    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 10,
        method: "session/cancel",
        params: { sessionId: "session-test-1" },
      },
      config,
      promptState,
    )

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 10,
      result: {},
    })
    expect(promptState.cancelled).toBe(true)
    expect(promptState.activeSessionId).toBeNull()
  })
})
