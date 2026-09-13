import { FakeAcpConfig } from "./config"
import { FakeAcpConfigState, createFakeAcpConfigState } from "./config.state"
import { FakeAcpPromptState } from "./prompt-state"
import {
  isJsonRpcNotification,
  isJsonRpcRequest,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./protocol"

export type HandlerResult = {
  response?: JsonRpcResponse
  holdPromptResponse?: boolean
  promptCompletionDelayMs?: number
  outbound: JsonRpcRequest[]
  notifications: JsonRpcNotification[]
  deferredNotifications: ReadonlyArray<{
    delayMs: number
    notification: JsonRpcNotification
  }>
}

export type NotificationHandlerResult = {
  promptResponse?: JsonRpcResponse
}

const emptyHandlerExtras = () => ({
  outbound: [] as JsonRpcRequest[],
  notifications: [] as JsonRpcNotification[],
  deferredNotifications: [] as HandlerResult["deferredNotifications"],
})

const jsonRpcError = (id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
})

const jsonRpcResult = (id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  result,
})

const availableCommandsUpdate = (sessionId: string): JsonRpcNotification => ({
  jsonrpc: "2.0",
  method: "session/update",
  params: {
    sessionId,
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
})

const agentMessageChunk = (sessionId: string, text: string): JsonRpcNotification => ({
  jsonrpc: "2.0",
  method: "session/update",
  params: {
    sessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text },
    },
  },
})

const scriptedSessionUpdates = (sessionId: string): JsonRpcNotification[] => [
  agentMessageChunk(sessionId, "Hello"),
  agentMessageChunk(sessionId, " world"),
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update: { sessionUpdate: "user_message_chunk" } },
  },
]

const loadReplayUpdates = (sessionId: string): JsonRpcNotification[] => [
  agentMessageChunk(sessionId, "Replayed"),
]

const toolCallUpdates = (sessionId: string): JsonRpcNotification[] => [
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-call-1",
        title: "read_file",
        toolName: "read_file",
        kind: "read",
        status: "pending",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-call-1",
        toolName: "read_file",
        kind: "read",
        status: "completed",
      },
    },
  },
]
const PERMISSION_REQUEST_ID = 1000
const FS_READ_REQUEST_ID = 1001
const FS_WRITE_REQUEST_ID = 1002
const TERMINAL_CREATE_REQUEST_ID = 1003
const CURSOR_ASK_QUESTION_ID = 1004
const CURSOR_CREATE_PLAN_ID = 1005
const UNKNOWN_EXTENSION_ID = 1006

const permissionRequest = (
  sessionId: string,
  options: Array<{ optionId: string; name: string }>,
): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: PERMISSION_REQUEST_ID,
  method: "session/request_permission",
  params: {
    sessionId,
    options,
    toolCall: { toolCallId: "tool-call-permission", name: "fake-tool" },
  },
})

const fsReadRequest = (sessionId: string, filePath: string): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: FS_READ_REQUEST_ID,
  method: "fs/read_text_file",
  params: {
    sessionId,
    path: filePath,
  },
})

const fsWriteRequest = (sessionId: string, filePath: string, content: string): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: FS_WRITE_REQUEST_ID,
  method: "fs/write_text_file",
  params: {
    sessionId,
    path: filePath,
    content,
  },
})

const terminalCreateRequest = (sessionId: string, command: string): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: TERMINAL_CREATE_REQUEST_ID,
  method: "terminal/create",
  params: {
    sessionId,
    command,
  },
})

const cursorAskQuestionRequest = (sessionId: string): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: CURSOR_ASK_QUESTION_ID,
  method: "cursor/ask_question",
  params: {
    sessionId,
    toolCallId: "call-ask",
    questions: [{
      id: "q1",
      prompt: "Pick one",
      options: [
        { id: "opt-a", label: "Option A" },
        { id: "opt-b", label: "Option B" },
      ],
    }],
  },
})

const cursorCreatePlanRequest = (sessionId: string): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: CURSOR_CREATE_PLAN_ID,
  method: "cursor/create_plan",
  params: {
    sessionId,
    toolCallId: "call-plan",
    plan: "Do the thing",
    todos: [{ id: "todo-1", content: "Step one", status: "pending" }],
  },
})

const unknownExtensionRequest = (): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: UNKNOWN_EXTENSION_ID,
  method: "vendor/unknown_method",
  params: { value: true },
})

const outboundAfterSessionNew = (sessionId: string, config: FakeAcpConfig): JsonRpcRequest[] => [
  ...(config.emitPermissionRequest
    ? [permissionRequest(sessionId, [{ optionId: "allow-once", name: "Allow once" }])]
    : []),
  ...(config.emitPermissionRequestNoAllow
    ? [permissionRequest(sessionId, [{ optionId: "reject-once", name: "Reject once" }])]
    : []),
  ...(config.emitFsReadRequest ? [fsReadRequest(sessionId, config.fsReadPath)] : []),
  ...(config.emitFsWriteRequest
    ? [fsWriteRequest(sessionId, config.fsWritePath, config.fsWriteContent)]
    : []),
  ...(config.emitTerminalCreateRequest
    ? [terminalCreateRequest(sessionId, config.terminalCommand)]
    : []),
  ...(config.emitCursorAskQuestion ? [cursorAskQuestionRequest(sessionId)] : []),
  ...(config.emitCursorCreatePlan ? [cursorCreatePlanRequest(sessionId)] : []),
  ...(config.emitUnknownExtension ? [unknownExtensionRequest()] : []),
]

const readSessionId = (params: unknown): string | undefined => {
  const value = params as { sessionId?: string }
  return value.sessionId
}

const handleInitialize = (request: JsonRpcRequest, config: FakeAcpConfig): HandlerResult => ({
  response: jsonRpcResult(request.id, {
    protocolVersion: 1,
    agentCapabilities: {
      loadSession: config.loadSession,
      sessionCapabilities: {
        ...(config.sessionClose ? { close: {} } : {}),
        ...(config.sessionList ? { list: {} } : {}),
      },
    },
    agentInfo: { name: "fake-acp", version: "0.0.0" },
    authMethods: [],
  }),
  ...emptyHandlerExtras(),
})

const handleAuthenticate = (request: JsonRpcRequest): HandlerResult => ({
  response: jsonRpcResult(request.id, {}),
  ...emptyHandlerExtras(),
})

const readCwd = (params: unknown): string => {
  const value = params as { cwd?: string }
  return value.cwd ?? ""
}

const handleSessionNew = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
  promptState: FakeAcpPromptState,
  configState: FakeAcpConfigState,
): HandlerResult => {
  if (config.sessionNewFailsWithAuthRequired) {
    return {
      response: jsonRpcError(request.id, -32000, "Authentication required"),
      ...emptyHandlerExtras(),
    }
  }

  const sessionId = config.sessionNewSessionId ?? promptState.allocateSessionId()
  promptState.recordSession({ sessionId, cwd: readCwd(request.params) })
  configState.initialize(sessionId)
  return {
    response: jsonRpcResult(request.id, {
      sessionId,
      ...(config.configOptions.length > 0 ? { configOptions: config.configOptions } : {}),
    }),
    outbound: outboundAfterSessionNew(sessionId, config),
    notifications: config.emitAvailableCommandsOnNew
      ? [availableCommandsUpdate(sessionId)]
      : [],
    deferredNotifications: [],
  }
}

const handleSessionList = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
  promptState: FakeAcpPromptState,
): HandlerResult => {
  if (!config.sessionList) {
    return {
      response: jsonRpcError(request.id, -32601, "session/list not supported"),
      ...emptyHandlerExtras(),
    }
  }

  return {
    response: jsonRpcResult(request.id, { sessions: promptState.listSessions() }),
    ...emptyHandlerExtras(),
  }
}

const handleSessionLoad = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
  configState: FakeAcpConfigState,
): HandlerResult => {
  if (!config.loadSession) {
    return {
      response: jsonRpcError(request.id, -32601, "loadSession not supported"),
      ...emptyHandlerExtras(),
    }
  }

  if (config.sessionLoadFails) {
    return {
      response: jsonRpcError(request.id, -32602, "Invalid params"),
      ...emptyHandlerExtras(),
    }
  }

  configState.initialize(config.sessionLoadSessionId)
  return {
    response: jsonRpcResult(request.id, {
      sessionId: config.sessionLoadSessionId,
      ...(config.configOptions.length > 0 ? { configOptions: config.configOptions } : {}),
    }),
    notifications: config.emitLoadReplayUpdates
      ? loadReplayUpdates(config.sessionLoadSessionId)
      : [],
    outbound: [],
    deferredNotifications: [],
  }
}

const handleSessionClose = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
  promptState: FakeAcpPromptState,
): HandlerResult => {
  if (!config.sessionClose) {
    return {
      response: jsonRpcError(request.id, -32601, "session close not supported"),
      ...emptyHandlerExtras(),
    }
  }

  if (config.sessionCloseFails) {
    return {
      response: jsonRpcError(request.id, -32000, "session close failed"),
      ...emptyHandlerExtras(),
    }
  }

  const sessionId = readSessionId(request.params)
  if (sessionId !== undefined) {
    promptState.removeSession(sessionId)
  }

  return {
    response: jsonRpcResult(request.id, {}),
    ...emptyHandlerExtras(),
  }
}

const handleSessionSetConfigOption = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
  configState: FakeAcpConfigState,
): HandlerResult => {
  if (!config.setConfigOption) {
    return {
      response: jsonRpcError(request.id, -32601, "set_config_option not supported"),
      ...emptyHandlerExtras(),
    }
  }

  const params = request.params as {
    sessionId?: string
    configId?: string
    value?: string | boolean
  }
  if (params.sessionId === undefined || params.configId === undefined) {
    return {
      response: jsonRpcError(request.id, -32602, "sessionId and configId are required"),
      ...emptyHandlerExtras(),
    }
  }

  const outcome = configState.apply(
    params.sessionId,
    params.configId,
    params.value ?? "",
  )
  if (outcome === "unknown-session") {
    return {
      response: jsonRpcError(request.id, -32002, "session not found"),
      ...emptyHandlerExtras(),
    }
  }
  if (outcome === "invalid") {
    return {
      response: jsonRpcError(request.id, -32602, "unknown configId or invalid value"),
      ...emptyHandlerExtras(),
    }
  }

  return {
    response: jsonRpcResult(request.id, {
      configOptions: configState.get(params.sessionId),
    }),
    ...emptyHandlerExtras(),
  }
}

const handleSessionPrompt = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
  promptState: FakeAcpPromptState,
): HandlerResult => {
  const sessionId = readSessionId(request.params)
  if (sessionId === undefined) {
    return {
      response: jsonRpcError(request.id, -32602, "sessionId is required"),
      ...emptyHandlerExtras(),
    }
  }

  if (config.promptFailsWithAuthRequired) {
    return {
      response: jsonRpcError(request.id, -32000, "Authentication required"),
      ...emptyHandlerExtras(),
    }
  }

  promptState.start({ sessionId, requestId: request.id })

  const updates = [
    ...(config.emitSessionUpdatesOnPrompt ? scriptedSessionUpdates(sessionId) : []),
    ...(config.emitToolUpdatesOnPrompt ? toolCallUpdates(sessionId) : []),
  ]

  const permissionOutbound = config.emitPermissionRequestOnPrompt
    ? [
        permissionRequest(sessionId, [
          { optionId: "allow-once", name: "Allow once" },
          { optionId: "reject-once", name: "Reject once" },
        ]),
      ]
    : []

  if (permissionOutbound.length > 0) {
    return {
      holdPromptResponse: true,
      outbound: permissionOutbound,
      notifications: updates.slice(0, 1),
      deferredNotifications: updates.slice(1).map((notification, index) => ({
        delayMs: (index + 1) * 20,
        notification,
      })),
    }
  }

  if (updates.length === 0) {
    const requestId = promptState.completeNatural(sessionId)
    return {
      response: jsonRpcResult(requestId ?? request.id, { stopReason: "end_turn" }),
      ...emptyHandlerExtras(),
    }
  }

  const lastDeferredDelayMs = updates.length > 1 ? (updates.length - 1) * 20 : 0
  const configuredDelayMs = config.promptCompletionDelayMs ?? 0

  return {
    holdPromptResponse: true,
    promptCompletionDelayMs: Math.max(lastDeferredDelayMs + 20, configuredDelayMs),
    outbound: [],
    notifications: updates.slice(0, 1),
    deferredNotifications: updates.slice(1).map((notification, index) => ({
      delayMs: (index + 1) * 20,
      notification,
    })),
  }
}

type RequestHandler = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
  promptState: FakeAcpPromptState,
  configState: FakeAcpConfigState,
) => HandlerResult

const requestHandlers: Record<string, RequestHandler> = {
  initialize: (request, config) => handleInitialize(request, config),
  authenticate: (request) => handleAuthenticate(request),
  "session/new": (request, config, promptState, configState) =>
    handleSessionNew(request, config, promptState, configState),
  "session/list": (request, config, promptState) =>
    handleSessionList(request, config, promptState),
  "session/load": (request, config, _promptState, configState) =>
    handleSessionLoad(request, config, configState),
  "session/close": (request, config, promptState) =>
    handleSessionClose(request, config, promptState),
  "session/prompt": (request, config, promptState) =>
    handleSessionPrompt(request, config, promptState),
  "session/set_config_option": (request, config, _promptState, configState) =>
    handleSessionSetConfigOption(request, config, configState),
}

export const handleJsonRpcRequest = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
  promptState: FakeAcpPromptState,
  configState: FakeAcpConfigState = createFakeAcpConfigState(config.configOptions),
): HandlerResult => {
  const handler = requestHandlers[request.method]
  if (!handler) {
    return {
      response: jsonRpcError(request.id, -32601, `method not found: ${request.method}`),
      ...emptyHandlerExtras(),
    }
  }

  return handler(request, config, promptState, configState)
}

export const handleJsonRpcNotification = (
  notification: JsonRpcNotification,
  promptState: FakeAcpPromptState,
): NotificationHandlerResult => {
  if (notification.method !== "session/cancel") {
    return {}
  }

  const sessionId = readSessionId(notification.params)
  if (sessionId === undefined) {
    return {}
  }

  const requestId = promptState.cancel(sessionId)
  if (requestId === undefined) {
    return {}
  }

  return {
    promptResponse: jsonRpcResult(requestId, { stopReason: "cancelled" }),
  }
}

export const handleJsonRpcMessage = (
  message: JsonRpcMessage,
  config: FakeAcpConfig,
  promptState: FakeAcpPromptState,
  configState: FakeAcpConfigState,
): HandlerResult | NotificationHandlerResult | undefined => {
  if (isJsonRpcNotification(message)) {
    return handleJsonRpcNotification(message, promptState)
  }

  if (!isJsonRpcRequest(message)) {
    return undefined
  }

  return handleJsonRpcRequest(message, config, promptState, configState)
}

export const shouldEmitDeferredNotification = (
  promptState: FakeAcpPromptState,
  sessionId: string,
): boolean => promptState.shouldEmit(sessionId)

export const completePromptIfActive = (
  promptState: FakeAcpPromptState,
  sessionId: string,
): JsonRpcResponse | undefined => {
  const requestId = promptState.completeNatural(sessionId)
  if (requestId === undefined) {
    return undefined
  }

  return jsonRpcResult(requestId, { stopReason: "end_turn" })
}
