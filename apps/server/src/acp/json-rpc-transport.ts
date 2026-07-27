type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type NotificationHandler = (params: unknown) => void

export type JsonRpcTransport = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>
  onNotification: (method: string, handler: NotificationHandler) => void
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

  return { readLine, cancel: () => reader.cancel() }
}

export const createJsonRpcTransport = ({
  stdin,
  stdout,
}: CreateJsonRpcTransportParams): JsonRpcTransport => {
  const { readLine, cancel } = createLineReader(stdout)
  const pendingRequests = new Map<string | number, PendingRequest>()
  const notificationHandlers = new Map<string, NotificationHandler[]>()
  const closed = { value: false }

  const nextRequestId = (() => {
    const ids = [0]
    return () => {
      ids[0] += 1
      return ids[0]
    }
  })()

  const dispatchMessage = (message: {
    id?: string | number
    method?: string
    params?: unknown
    result?: unknown
    error?: { message: string }
  }) => {
    if (message.method !== undefined && message.id === undefined) {
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
    if (message.error) {
      pending.reject(new Error(message.error.message))
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
      dispatchMessage(message as {
        id?: string | number
        method?: string
        params?: unknown
        result?: unknown
        error?: { message: string }
      })
    }

    await pump()
  }

  void pump()

  const request = <T = unknown>(method: string, params?: unknown): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextRequestId()
      pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
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

  const onNotification = (method: string, handler: NotificationHandler) => {
    const handlers = notificationHandlers.get(method) ?? []
    notificationHandlers.set(method, [...handlers, handler])
  }

  const close = () => {
    closed.value = true
    cancel()
    pendingRequests.forEach((pending) => {
      pending.reject(new Error("transport closed"))
    })
    pendingRequests.clear()
  }

  return { request, onNotification, close }
}
