export type JsonRpcId = string | number

export type JsonRpcRequest = {
  jsonrpc: "2.0"
  id: JsonRpcId
  method: string
  params?: unknown
}

export type JsonRpcResponse = {
  jsonrpc: "2.0"
  id: JsonRpcId
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export type JsonRpcNotification = {
  jsonrpc: "2.0"
  method: string
  params?: unknown
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

export const serializeJsonRpcMessage = (message: JsonRpcMessage): string =>
  `${JSON.stringify(message)}\n`

export const parseJsonRpcLine = (line: string): JsonRpcMessage => {
  const trimmed = line.trim()
  if (trimmed.length === 0) {
    throw new Error("empty JSON-RPC line")
  }
  const parsed: unknown = JSON.parse(trimmed)
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("jsonrpc" in parsed) ||
    parsed.jsonrpc !== "2.0"
  ) {
    throw new Error("invalid JSON-RPC message")
  }
  return parsed as JsonRpcMessage
}

export const isJsonRpcRequest = (message: JsonRpcMessage): message is JsonRpcRequest =>
  "method" in message && "id" in message

export const isJsonRpcNotification = (message: JsonRpcMessage): message is JsonRpcNotification =>
  "method" in message && !("id" in message)

export const isJsonRpcResponse = (message: JsonRpcMessage): message is JsonRpcResponse =>
  "id" in message && !("method" in message)
