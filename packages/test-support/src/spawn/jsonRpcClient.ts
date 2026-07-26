type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type PendingInboundRequest = {
  resolve: (value: { id: string | number; params: unknown }) => void
  reject: (error: Error) => void
}

type JsonRpcClient = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>
  respond: (id: string | number, result: unknown) => Promise<void>
  waitForRequest: (method: string) => Promise<{ id: string | number; params: unknown }>
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

  return { readLine }
}

export const createJsonRpcClient = (
  stdin: { write: (chunk: string) => void | number | Promise<void | number> },
  stdout: ReadableStream<Uint8Array>,
): JsonRpcClient => {
  const { readLine } = createLineReader(stdout)
  const pendingRequests = new Map<string | number, PendingRequest>()
  const pendingInbound = new Map<string, PendingInboundRequest>()
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
    if (message.method !== undefined && message.id !== undefined) {
      const waiter = pendingInbound.get(message.method)
      if (waiter) {
        pendingInbound.delete(message.method)
        waiter.resolve({ id: message.id, params: message.params })
      }
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

  const respond = async (id: string | number, result: unknown): Promise<void> => {
    await stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id,
        result,
      })}\n`,
    )
  }

  const waitForRequest = (
    method: string,
  ): Promise<{ id: string | number; params: unknown }> =>
    new Promise((resolve, reject) => {
      pendingInbound.set(method, { resolve, reject })
    })

  return { request, respond, waitForRequest }
}
