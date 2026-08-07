import { JournalPhase } from "contracts/events/journal-record"
import { createAcpJsonRpcError, readSafeJsonRpcErrorData } from "./json-rpc-error"

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  method: string
  context?: AcpOperationContext
}

type NotificationHandler = (params: unknown) => void

type InboundRequestHandler = (input: {
  id: string | number
  params: unknown
}) => void | Promise<void>

type UnhandledRequestHandler = (input: {
  method: string
  id: string | number
  params: unknown
}) => void | Promise<void>

export type AcpOperationContext = {
  sessionId: string
  workspaceId: string
  turnId?: string
  phase: JournalPhase
}

export type JsonRpcObserverEvent =
  | {
      kind: "outbound_request"
      id: number
      method: string
      context?: AcpOperationContext
    }
  | {
      kind: "inbound_response"
      id: number
      method: string
      success: boolean
      context?: AcpOperationContext
    }
  | {
      kind: "inbound_notification"
      method: string
      params: unknown
    }
  | {
      kind: "inbound_request"
      id: string | number
      method: string
      params: unknown
    }

type JsonRpcObserver = (event: JsonRpcObserverEvent) => void

export type JsonRpcTransport = {
  allocateRequestId: () => number
  request: <T = unknown>(
    method: string,
    params?: unknown,
    context?: AcpOperationContext,
    options?: { requestId?: number },
  ) => Promise<T>
  notify: (method: string, params?: unknown) => void
  onNotification: (method: string, handler: NotificationHandler) => void
  onRequest: (method: string, handler: InboundRequestHandler) => void
  onUnhandledRequest: (handler: UnhandledRequestHandler) => void
  onObserverEvent: (handler: JsonRpcObserver) => void
  respond: (id: string | number, result: unknown) => void
  respondError: (id: string | number, code: number, message: string) => void
  close: () => void
}

export type CreateJsonRpcTransportParams = {
  stdin: { write: (chunk: string) => void | number | Promise<void | number> }
  stdout: ReadableStream<Uint8Array>
}

const createLineReader = (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const buffer: string[] = [""]

  const readLine = async (): Promise<string | undefined> => {
    const readNext = async (): Promise<string | undefined> => {
      const current = buffer[0] ?? ""
      const newlineIndex = current.indexOf("\n")
      if (newlineIndex !== -1) {
        const line = current.slice(0, newlineIndex)
        buffer[0] = current.slice(newlineIndex + 1)
        return line
      }

      const { done, value } = await reader.read()
      if (done) {
        return current.length > 0 ? current : undefined
      }

      buffer[0] = `${current}${decoder.decode(value, { stream: true })}`
      return readNext()
    }

    return readNext()
  }

  return {
    readLine,
    cancel: () => {
      void reader.cancel()
    },
  }
}

export const createJsonRpcTransport = ({
  stdin,
  stdout,
}: CreateJsonRpcTransportParams): JsonRpcTransport => {
  const { readLine, cancel } = createLineReader(stdout)
  const pendingRequests = new Map<string | number, PendingRequest>()
  const notificationHandlers = new Map<string, NotificationHandler[]>()
  const requestHandlers = new Map<string, InboundRequestHandler[]>()
  const unhandledRequestHandlers: UnhandledRequestHandler[] = []
  const observerHandlers: JsonRpcObserver[] = []
  const closed = { value: false }

  const emitObserver = (event: JsonRpcObserverEvent) => {
    observerHandlers.forEach((handler) => handler(event))
  }

  const nextRequestId = (() => {
    const ids = [0]
    return () => {
      ids[0] += 1
      return ids[0]
    }
  })()

  const dispatchInboundRequest = async (message: {
    id: string | number
    method: string
    params?: unknown
  }) => {
    emitObserver({
      kind: "inbound_request",
      id: message.id,
      method: message.method,
      params: message.params,
    })

    const handlers = requestHandlers.get(message.method) ?? []
    if (handlers.length > 0) {
      await Promise.all(
        handlers.map((handler) =>
          Promise.resolve(
            handler({
              id: message.id,
              params: message.params,
            }),
          ),
        ),
      )
      return
    }

    await Promise.all(
      unhandledRequestHandlers.map((handler) =>
        Promise.resolve(
          handler({
            method: message.method,
            id: message.id,
            params: message.params,
          }),
        ),
      ),
    )
  }

  const dispatchMessage = (message: {
    id?: string | number
    method?: string
    params?: unknown
    result?: unknown
    error?: { code?: number; message: string; data?: unknown }
  }) => {
    if (message.method !== undefined && message.id !== undefined) {
      void dispatchInboundRequest({
        id: message.id,
        method: message.method,
        params: message.params,
      })
      return
    }

    if (message.method !== undefined && message.id === undefined) {
      emitObserver({
        kind: "inbound_notification",
        method: message.method,
        params: message.params,
      })
      const handlers = notificationHandlers.get(message.method) ?? []
      handlers.forEach((handler) => handler(message.params))
      return
    }

    if (message.id === undefined) {
      return
    }

    const pending = pendingRequests.get(message.id)
    if (!pending) {
      return
    }

    pendingRequests.delete(message.id)
    const success = message.error === undefined
    emitObserver({
      kind: "inbound_response",
      id: Number(message.id),
      method: pending.method,
      success,
      context: pending.context,
    })

    if (message.error) {
      const safeData = readSafeJsonRpcErrorData(message.error.data)
      pending.reject(
        createAcpJsonRpcError({
          message: message.error.message,
          code: message.error.code ?? -32000,
          ...(safeData !== undefined ? { data: safeData } : {}),
        }),
      )
      return
    }

    pending.resolve(message.result)
  }

  const pump = async () => {
    if (closed.value) {
      return
    }

    const line = await readLine()
    if (line === undefined) {
      return
    }

    const message: unknown = JSON.parse(line)
    if (typeof message === "object" && message !== null) {
      dispatchMessage(message)
    }

    await pump()
  }

  void pump()

  const request = <T = unknown>(
    method: string,
    params?: unknown,
    context?: AcpOperationContext,
    options?: { requestId?: number },
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = options?.requestId ?? nextRequestId()
      pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        method,
        context,
      })
      emitObserver({
        kind: "outbound_request",
        id,
        method,
        context,
      })
      void stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
        })}\n`,
      )
    })

  const notify = (method: string, params?: unknown) => {
    void stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      })}\n`,
    )
  }

  const onNotification = (method: string, handler: NotificationHandler) => {
    const handlers = notificationHandlers.get(method) ?? []
    notificationHandlers.set(method, [...handlers, handler])
  }

  const onRequest = (method: string, handler: InboundRequestHandler) => {
    const handlers = requestHandlers.get(method) ?? []
    requestHandlers.set(method, [...handlers, handler])
  }

  const onUnhandledRequest = (handler: UnhandledRequestHandler) => {
    unhandledRequestHandlers.push(handler)
  }

  const onObserverEvent = (handler: JsonRpcObserver) => {
    observerHandlers.push(handler)
  }

  const respond = (id: string | number, result: unknown) => {
    void stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id,
        result,
      })}\n`,
    )
  }

  const respondError = (id: string | number, code: number, message: string) => {
    void stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code, message },
      })}\n`,
    )
  }

  const close = () => {
    closed.value = true
    cancel()
    pendingRequests.forEach((pending) => {
      pending.reject(new Error("transport closed"))
    })
    pendingRequests.clear()
  }

  return {
    allocateRequestId: nextRequestId,
    request,
    notify,
    onNotification,
    onRequest,
    onUnhandledRequest,
    onObserverEvent,
    respond,
    respondError,
    close,
  }
}
