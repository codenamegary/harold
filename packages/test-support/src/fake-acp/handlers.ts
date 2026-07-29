import { FakeAcpConfig } from "./config"
import { FakeAcpPromptState } from "./prompt-state"
import { JsonRpcMessage, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from "./protocol"

export type HandlerResult = {
  response: JsonRpcResponse
  outbound: JsonRpcRequest[]
  notifications: JsonRpcNotification[]
  deferredNotifications: ReadonlyArray<{
    delayMs: number
    notification: JsonRpcNotification
  }>
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

const scriptedSessionUpdates = (sessionId: string): JsonRpcNotification[] => [
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update: { kind: "agent_message_chunk", content: "Hello" } },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update: { kind: "agent_message_chunk", content: " world" } },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update: { kind: "turn_complete" } },
  },
]

const PERMISSION_REQUEST_ID = 1000
const FS_READ_REQUEST_ID = 1001
const FS_WRITE_REQUEST_ID = 1002
const TERMINAL_CREATE_REQUEST_ID = 1003
const CURSOR_ASK_QUESTION_ID = 1004
const CURSOR_CREATE_PLAN_ID = 1005
const UNKNOWN_EXTENSION_ID = 1006

const permissionRequest = (sessionId: string, options: Array<{ optionId: string; name: string }>): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: PERMISSION_REQUEST_ID,
  method: "session/request_permission",
  params: {
    sessionId,
    options,
    toolCall: { name: "fake-tool" },
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

const cursorAskQuestionRequest = (): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: CURSOR_ASK_QUESTION_ID,
  method: "cursor/ask_question",
  params: {
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

const cursorCreatePlanRequest = (): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: CURSOR_CREATE_PLAN_ID,
  method: "cursor/create_plan",
  params: {
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
  ...(config.emitCursorAskQuestion ? [cursorAskQuestionRequest()] : []),
  ...(config.emitCursorCreatePlan ? [cursorCreatePlanRequest()] : []),
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
      sessionCapabilities: { close: config.sessionClose },
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

const handleSessionNew = (request: JsonRpcRequest, config: FakeAcpConfig): HandlerResult => ({
  response: jsonRpcResult(request.id, { sessionId: config.sessionNewSessionId }),
  outbound: outboundAfterSessionNew(config.sessionNewSessionId, config),
  notifications: [],
  deferredNotifications: [],
})

const handleSessionLoad = (request: JsonRpcRequest, config: FakeAcpConfig): HandlerResult => {
  if (!config.loadSession) {
    return {
      response: jsonRpcError(request.id, -32601, "loadSession not supported"),
      ...emptyHandlerExtras(),
    }
  }

  if (config.sessionLoadFails) {
    return {
      response: jsonRpcError(request.id, -32000, "session load failed"),
      ...emptyHandlerExtras(),
    }
  }

  return {
    response: jsonRpcResult(request.id, { sessionId: config.sessionLoadSessionId }),
    ...emptyHandlerExtras(),
  }
}

const handleSessionClose = (request: JsonRpcRequest, config: FakeAcpConfig): HandlerResult => {
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

  return {
    response: jsonRpcResult(request.id, {}),
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

  promptState.start(sessionId)

  if (!config.emitSessionUpdatesOnPrompt) {
    return {
      response: jsonRpcResult(request.id, { stopReason: "end_turn" }),
      ...emptyHandlerExtras(),
    }
  }

  const updates = scriptedSessionUpdates(sessionId)
  return {
    response: jsonRpcResult(request.id, { stopReason: "end_turn" }),
    outbound: [],
    notifications: updates.slice(0, 1),
    deferredNotifications: updates.slice(1).map((notification, index) => ({
      delayMs: (index + 1) * 20,
      notification,
    })),
  }
}

const handleSessionCancel = (
  request: JsonRpcRequest,
  promptState: FakeAcpPromptState,
): HandlerResult => {
  const sessionId = readSessionId(request.params)
  if (sessionId === undefined) {
    return {
      response: jsonRpcError(request.id, -32602, "sessionId is required"),
      ...emptyHandlerExtras(),
    }
  }

  promptState.cancel(sessionId)

  return {
    response: jsonRpcResult(request.id, {}),
    ...emptyHandlerExtras(),
  }
}

type RequestHandler = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
  promptState: FakeAcpPromptState,
) => HandlerResult

const requestHandlers: Record<string, RequestHandler> = {
  initialize: (request, config) => handleInitialize(request, config),
  authenticate: (request) => handleAuthenticate(request),
  "session/new": (request, config) => handleSessionNew(request, config),
  "session/load": (request, config) => handleSessionLoad(request, config),
  "session/close": (request, config) => handleSessionClose(request, config),
  "session/prompt": (request, config, promptState) =>
    handleSessionPrompt(request, config, promptState),
  "session/cancel": (request, _config, promptState) =>
    handleSessionCancel(request, promptState),
}

export const handleJsonRpcRequest = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
  promptState: FakeAcpPromptState,
): HandlerResult => {
  const handler = requestHandlers[request.method]
  if (!handler) {
    return {
      response: jsonRpcError(request.id, -32601, `method not found: ${request.method}`),
      ...emptyHandlerExtras(),
    }
  }

  return handler(request, config, promptState)
}

export const handleJsonRpcMessage = (
  message: JsonRpcMessage,
  config: FakeAcpConfig,
  promptState: FakeAcpPromptState,
): HandlerResult | undefined => {
  if (!("method" in message)) {
    return undefined
  }

  return handleJsonRpcRequest(message, config, promptState)
}

export const shouldEmitDeferredNotification = (
  promptState: FakeAcpPromptState,
  sessionId: string,
): boolean => promptState.shouldEmit(sessionId)
