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

const permissionRequest = (sessionId: string): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id: PERMISSION_REQUEST_ID,
  method: "session/request_permission",
  params: {
    sessionId,
    options: [{ optionId: "allow-once", name: "Allow once" }],
    toolCall: { name: "fake-tool" },
  },
})

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
  outbound: config.emitPermissionRequest
    ? [permissionRequest(config.sessionNewSessionId)]
    : [],
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
