import { FakeAcpConfig } from "./config"
import { JsonRpcMessage, JsonRpcRequest, JsonRpcResponse } from "./protocol"

export type HandlerResult = {
  response: JsonRpcResponse
  outbound: JsonRpcRequest[]
}

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
  outbound: [],
})

const handleAuthenticate = (request: JsonRpcRequest): HandlerResult => ({
  response: jsonRpcResult(request.id, {}),
  outbound: [],
})

const handleSessionNew = (request: JsonRpcRequest, config: FakeAcpConfig): HandlerResult => ({
  response: jsonRpcResult(request.id, { sessionId: config.sessionNewSessionId }),
  outbound: outboundAfterSessionNew(config.sessionNewSessionId, config),
})

const handleSessionLoad = (request: JsonRpcRequest, config: FakeAcpConfig): HandlerResult => {
  if (!config.loadSession) {
    return {
      response: jsonRpcError(request.id, -32601, "loadSession not supported"),
      outbound: [],
    }
  }

  return {
    response: jsonRpcResult(request.id, { sessionId: config.sessionLoadSessionId }),
    outbound: [],
  }
}

const handleSessionClose = (request: JsonRpcRequest, config: FakeAcpConfig): HandlerResult => {
  if (!config.sessionClose) {
    return {
      response: jsonRpcError(request.id, -32601, "session close not supported"),
      outbound: [],
    }
  }

  if (config.sessionCloseFails) {
    return {
      response: jsonRpcError(request.id, -32000, "session close failed"),
      outbound: [],
    }
  }

  return {
    response: jsonRpcResult(request.id, {}),
    outbound: [],
  }
}

const requestHandlers: Record<
  string,
  (request: JsonRpcRequest, config: FakeAcpConfig) => HandlerResult
> = {
  initialize: handleInitialize,
  authenticate: handleAuthenticate,
  "session/new": handleSessionNew,
  "session/load": handleSessionLoad,
  "session/close": handleSessionClose,
}

export const handleJsonRpcRequest = (
  request: JsonRpcRequest,
  config: FakeAcpConfig,
): HandlerResult => {
  const handler = requestHandlers[request.method]
  if (!handler) {
    return {
      response: jsonRpcError(request.id, -32601, `method not found: ${request.method}`),
      outbound: [],
    }
  }

  return handler(request, config)
}

export const handleJsonRpcMessage = (
  message: JsonRpcMessage,
  config: FakeAcpConfig,
): HandlerResult | undefined => {
  if (!("method" in message)) {
    return undefined
  }

  return handleJsonRpcRequest(message, config)
}
