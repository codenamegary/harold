import { describe, expect, test } from "bun:test"
import { readFakeAcpConfig, fakeAcpEnvFromCapabilities } from "./config"
import { createFakeAcpConfigState } from "./config.state"
import {
  completePromptIfActive,
  handleJsonRpcNotification,
  handleJsonRpcRequest,
} from "./handlers"
import { createFakeAcpPromptState } from "./prompt-state"
import { parseJsonRpcLine, serializeJsonRpcMessage } from "./protocol"

const createPromptState = () => createFakeAcpPromptState()

const sessionIdFrom = (response: { result?: unknown } | undefined): string => {
  if (
    typeof response?.result !== "object"
    || response.result === null
    || !("sessionId" in response.result)
    || typeof response.result.sessionId !== "string"
  ) {
    throw new Error("expected sessionId in response")
  }
  return response.result.sessionId
}

const notificationSessionId = (params: unknown): string | undefined => {
  if (
    typeof params !== "object"
    || params === null
    || !("sessionId" in params)
    || typeof params.sessionId !== "string"
  ) {
    return undefined
  }
  return params.sessionId
}

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
      FAKE_ACP_SESSION_LIST: "true",
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
          sessionCapabilities: { close: {}, list: {} },
        },
        agentInfo: { name: "fake-acp", version: "0.0.0" },
        authMethods: [],
      },
    })
  })

  test("session/list is rejected when sessionList is disabled", () => {
    const config = readFakeAcpConfig({ FAKE_ACP_SESSION_LIST: "false" })

    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 10,
        method: "session/list",
        params: {},
      },
      config,
      createPromptState(),
    )

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 10,
      error: { code: -32601, message: "session/list not supported" },
    })
  })

  test("session/list returns sessions created via session/new", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_SESSION_LIST: "true",
      FAKE_ACP_SESSION_NEW_SESSION_ID: "listed-session-1",
    })
    const promptState = createPromptState()

    handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 11,
        method: "session/new",
        params: { cwd: "/tmp/project-a", mcpServers: [] },
      },
      config,
      promptState,
    )

    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 12,
        method: "session/list",
        params: {},
      },
      config,
      promptState,
    )

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 12,
      result: {
        sessions: [
          {
            sessionId: "listed-session-1",
            cwd: "/tmp/project-a",
            title: "listed-session-1",
            updatedAt: expect.any(String),
          },
        ],
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

  test("session/new emits available_commands_update when enabled", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_SESSION_NEW_SESSION_ID: "session-cmds-1",
      FAKE_ACP_EMIT_AVAILABLE_COMMANDS_ON_NEW: "true",
    })

    const { notifications } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "session/new",
        params: { cwd: "/tmp", mcpServers: [] },
      },
      config,
      createPromptState(),
    )

    expect(notifications).toEqual([
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "session-cmds-1",
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
        },
      },
    ])
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
      result: {},
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

  test("session/prompt holds the response and emits wire-shaped updates when enabled", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_EMIT_SESSION_UPDATES_ON_PROMPT: "true",
    })
    const promptState = createPromptState()

    const { response, holdPromptResponse, notifications, deferredNotifications } =
      handleJsonRpcRequest(
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

    expect(response).toBeUndefined()
    expect(holdPromptResponse).toBe(true)
    expect(promptState.pendingRequestId("session-test-1")).toBe(8)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toEqual({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "session-test-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello" },
        },
      },
    })
    expect(deferredNotifications).toHaveLength(2)
  })

  test("session/cancel notification completes the pending prompt with cancelled", () => {
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

    const { promptResponse } = handleJsonRpcNotification(
      {
        jsonrpc: "2.0",
        method: "session/cancel",
        params: { sessionId: "session-test-1" },
      },
      promptState,
    )

    expect(promptResponse).toEqual({
      jsonrpc: "2.0",
      id: 9,
      result: { stopReason: "cancelled" },
    })
    expect(promptState.pendingRequestId("session-test-1")).toBeUndefined()
    expect(promptState.shouldEmit("session-test-1")).toBe(false)
  })

  test("session/cancel as a request is method not found", () => {
    const config = readFakeAcpConfig({})
    const promptState = createPromptState()

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

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 10,
      error: { code: -32601 },
    })
  })

  test("consecutive session/new returns distinct ids when env unset", () => {
    const config = readFakeAcpConfig({})
    const promptState = createPromptState()

    const first = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 11,
        method: "session/new",
        params: { cwd: "/tmp", mcpServers: [] },
      },
      config,
      promptState,
    )
    const second = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 12,
        method: "session/new",
        params: { cwd: "/tmp", mcpServers: [] },
      },
      config,
      promptState,
    )

    const firstId = sessionIdFrom(first.response)
    const secondId = sessionIdFrom(second.response)
    expect(firstId).not.toBe(secondId)
  })

  test("session/new keeps fixed id when FAKE_ACP_SESSION_NEW_SESSION_ID is set", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_SESSION_NEW_SESSION_ID: "fixed-session",
    })
    const promptState = createPromptState()

    const first = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 13,
        method: "session/new",
        params: { cwd: "/tmp", mcpServers: [] },
      },
      config,
      promptState,
    )
    const second = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 14,
        method: "session/new",
        params: { cwd: "/tmp", mcpServers: [] },
      },
      config,
      promptState,
    )

    expect(sessionIdFrom(first.response)).toBe("fixed-session")
    expect(sessionIdFrom(second.response)).toBe("fixed-session")
  })

  test("overlapping prompts on different sessions both stay active", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_EMIT_SESSION_UPDATES_ON_PROMPT: "true",
    })
    const promptState = createPromptState()

    const first = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 15,
        method: "session/prompt",
        params: {
          sessionId: "session-a",
          prompt: [{ type: "text", text: "hello a" }],
        },
      },
      config,
      promptState,
    )
    const second = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 16,
        method: "session/prompt",
        params: {
          sessionId: "session-b",
          prompt: [{ type: "text", text: "hello b" }],
        },
      },
      config,
      promptState,
    )

    expect(first.holdPromptResponse).toBe(true)
    expect(second.holdPromptResponse).toBe(true)
    expect(promptState.pendingRequestId("session-a")).toBe(15)
    expect(promptState.pendingRequestId("session-b")).toBe(16)
    expect(promptState.shouldEmit("session-a")).toBe(true)
    expect(promptState.shouldEmit("session-b")).toBe(true)
    expect(first.notifications[0]?.params).toMatchObject({ sessionId: "session-a" })
    expect(second.notifications[0]?.params).toMatchObject({ sessionId: "session-b" })
    expect(first.deferredNotifications).toHaveLength(2)
    expect(second.deferredNotifications).toHaveLength(2)
    expect(first.deferredNotifications.every((item) =>
      notificationSessionId(item.notification.params) === "session-a"
    )).toBe(true)
    expect(second.deferredNotifications.every((item) =>
      notificationSessionId(item.notification.params) === "session-b"
    )).toBe(true)
    expect(first.promptCompletionDelayMs).toBe(60)
    expect(second.promptCompletionDelayMs).toBe(60)

    expect(completePromptIfActive(promptState, "session-a")).toEqual({
      jsonrpc: "2.0",
      id: 15,
      result: { stopReason: "end_turn" },
    })
    expect(completePromptIfActive(promptState, "session-b")).toEqual({
      jsonrpc: "2.0",
      id: 16,
      result: { stopReason: "end_turn" },
    })
  })

  test("prompt completion delay env lengthens held prompts", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_EMIT_SESSION_UPDATES_ON_PROMPT: "true",
      FAKE_ACP_PROMPT_COMPLETION_DELAY_MS: "500",
    })

    const { holdPromptResponse, promptCompletionDelayMs } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 20,
        method: "session/prompt",
        params: {
          sessionId: "session-slow",
          prompt: [{ type: "text", text: "slow" }],
        },
      },
      config,
      createPromptState(),
    )

    expect(holdPromptResponse).toBe(true)
    expect(promptCompletionDelayMs).toBe(500)
  })

  test("session/cancel for one session does not cancel the other", () => {
    const config = readFakeAcpConfig({
      FAKE_ACP_EMIT_SESSION_UPDATES_ON_PROMPT: "true",
    })
    const promptState = createPromptState()

    handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 17,
        method: "session/prompt",
        params: {
          sessionId: "session-a",
          prompt: [{ type: "text", text: "hello a" }],
        },
      },
      config,
      promptState,
    )
    handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 18,
        method: "session/prompt",
        params: {
          sessionId: "session-b",
          prompt: [{ type: "text", text: "hello b" }],
        },
      },
      config,
      promptState,
    )

    const { promptResponse } = handleJsonRpcNotification(
      {
        jsonrpc: "2.0",
        method: "session/cancel",
        params: { sessionId: "session-a" },
      },
      promptState,
    )

    expect(promptResponse).toEqual({
      jsonrpc: "2.0",
      id: 17,
      result: { stopReason: "cancelled" },
    })
    expect(promptState.shouldEmit("session-a")).toBe(false)
    expect(promptState.pendingRequestId("session-a")).toBeUndefined()
    expect(promptState.shouldEmit("session-b")).toBe(true)
    expect(promptState.pendingRequestId("session-b")).toBe(18)

    const completed = completePromptIfActive(promptState, "session-b")
    expect(completed).toEqual({
      jsonrpc: "2.0",
      id: 18,
      result: { stopReason: "end_turn" },
    })
    expect(completePromptIfActive(promptState, "session-a")).toBeUndefined()
  })
})

describe("fake ACP config options", () => {
  const configOptions = [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "m1",
      options: [
        { value: "m1", name: "M1" },
        { value: "m2", name: "M2" },
      ],
    },
    {
      id: "thought_level",
      name: "Thinking",
      category: "thought_level",
      type: "select",
      currentValue: "medium",
      options: [
        { value: "off", name: "Off" },
        { value: "low", name: "Low" },
        { value: "medium", name: "Medium" },
        { value: "high", name: "High" },
      ],
    },
  ]

  const configWith = (
    env: Record<string, string> = {},
  ) =>
    readFakeAcpConfig({
      FAKE_ACP_LOAD_SESSION: "true",
      FAKE_ACP_SESSION_NEW_SESSION_ID: "fake-session-new",
      FAKE_ACP_CONFIG_OPTIONS: JSON.stringify(configOptions),
      ...env,
    })

  const request = (
    method: string,
    params: unknown,
    options: { withSession?: boolean } = {},
  ) => {
    const promptState = createPromptState()
    const configState = createFakeAcpConfigState(configOptions)
    if (options.withSession === true) {
      handleJsonRpcRequest(
        { jsonrpc: "2.0", id: 6, method: "session/new", params: { cwd: "/tmp/project" } },
        configWith(),
        promptState,
        configState,
      )
    }
    return handleJsonRpcRequest(
      { jsonrpc: "2.0", id: 7, method, params },
      configWith(),
      promptState,
      configState,
    )
  }

  test("parses the configured configOptions from the environment", () => {
    expect(configWith().configOptions).toEqual(configOptions)
    expect(
      fakeAcpEnvFromCapabilities({
        configOptions,
      }).FAKE_ACP_CONFIG_OPTIONS,
    ).toBe(JSON.stringify(configOptions))
  })

  test("session/new returns the configured configOptions", () => {
    const { response } = request("session/new", { cwd: "/tmp/project" })
    expect(response?.result).toMatchObject({
      sessionId: "fake-session-new",
      configOptions,
    })
  })

  test("session/load returns the configured configOptions", () => {
    const { response } = request("session/load", {
      sessionId: "fake-session-load",
      cwd: "/tmp/project",
    })
    expect(response?.result).toMatchObject({
      configOptions,
    })
    expect(response?.result).not.toHaveProperty("sessionId")
  })

  test("session/set_config_option applies the value and returns the full state", () => {
    const configState = createFakeAcpConfigState(configOptions)
    const state = { configOptions, prompt: createPromptState() }
    const call = (method: string, params: unknown) =>
      handleJsonRpcRequest(
        { jsonrpc: "2.0", id: 7, method, params },
        configWith(),
        state.prompt,
        configState,
      )

    call("session/new", { cwd: "/tmp/project" })
    const { response } = call("session/set_config_option", {
      sessionId: "fake-session-new",
      configId: "model",
      value: "m2",
    })

    expect(response?.result).toEqual({
      configOptions: [
        {
          ...configOptions[0],
          currentValue: "m2",
        },
        configOptions[1],
      ],
    })
  })

  test("session/set_config_option rejects an unknown configId", () => {
    const { response } = request(
      "session/set_config_option",
      {
        sessionId: "fake-session-new",
        configId: "nope",
        value: "m2",
      },
      { withSession: true },
    )
    expect(response?.error?.code).toBe(-32602)
  })

  test("session/set_config_option rejects a value outside the option list", () => {
    const { response } = request(
      "session/set_config_option",
      {
        sessionId: "fake-session-new",
        configId: "model",
        value: "not-a-model",
      },
      { withSession: true },
    )
    expect(response?.error?.code).toBe(-32602)
  })

  test("session/set_config_option reports an unknown session", () => {
    const { response } = request("session/set_config_option", {
      sessionId: "never-created",
      configId: "model",
      value: "m2",
    })
    expect(response?.error?.code).toBe(-32002)
  })

  test("session/set_config_option is method-not-found when unsupported", () => {
    const { response } = handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "session/set_config_option",
        params: { sessionId: "fake-session-new", configId: "model", value: "m2" },
      },
      configWith({ FAKE_ACP_SET_CONFIG_OPTION: "false" }),
      createPromptState(),
      createFakeAcpConfigState(configOptions),
    )
    expect(response?.error?.code).toBe(-32601)
  })
})
