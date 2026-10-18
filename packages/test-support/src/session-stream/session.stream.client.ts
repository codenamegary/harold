import {
  sessionCancelPath,
  sessionPromptsPath,
  extensionRepliesPath,
  permissionRepliesPath,
  SessionStreamServerMessage,
  SessionStreamServerMessageSchema,
} from "contracts/http/session.stream"

export type SseStream = {
  messages: SessionStreamServerMessage[]
  /** Number of `: ping` heartbeat comments received. */
  heartbeats: number
  waitFor: (
    predicate: (message: SessionStreamServerMessage) => boolean,
    timeoutMs?: number,
  ) => Promise<SessionStreamServerMessage>
  waitForEnd: (timeoutMs?: number) => Promise<void>
  close: () => Promise<void>
}

const defaultOpenTimeoutMs = 5_000
const defaultWaitTimeoutMs = 5_000

const describeMessages = (messages: SessionStreamServerMessage[]): string =>
  messages
    .map((message) => (message.type === "error" ? `error:${message.message}` : message.type))
    .join(", ")

/**
 * Opens a server→client SSE event stream (one stream per session) and parses
 * `data:` frames into `SessionStreamServerMessage`s. `: ping` comments are
 * counted as heartbeats. Rejects when the endpoint answers with a non-2xx.
 */
export const openSseStream = (params: {
  url: string
  credential?: string
  openTimeoutMs?: number
}): Promise<SseStream> =>
  new Promise((resolve, reject) => {
    const controller = new AbortController()
    const messages: SessionStreamServerMessage[] = []
    let ended = false
    let opened = false
    const waiters: Array<{
      predicate: (message: SessionStreamServerMessage) => boolean
      resolve: (message: SessionStreamServerMessage) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }> = []
    const endWaiters: Array<{
      resolve: () => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }> = []

    const failWaiters = (error: Error) => {
      for (const waiter of waiters.splice(0, waiters.length)) {
        clearTimeout(waiter.timer)
        waiter.reject(error)
      }
    }

    const finish = () => {
      if (ended) {
        return
      }
      ended = true
      failWaiters(new Error(`stream ended before match. received: ${describeMessages(messages)}`))
      for (const waiter of endWaiters.splice(0, endWaiters.length)) {
        clearTimeout(waiter.timer)
        waiter.resolve()
      }
    }

    const notify = (message: SessionStreamServerMessage) => {
      messages.push(message)
      const matched = waiters.filter((waiter) => waiter.predicate(message))
      for (const waiter of matched) {
        clearTimeout(waiter.timer)
        const index = waiters.indexOf(waiter)
        if (index >= 0) {
          waiters.splice(index, 1)
        }
        waiter.resolve(message)
      }
    }

    const client: SseStream = {
      messages,
      heartbeats: 0,
      waitFor: (predicate, timeoutMs = defaultWaitTimeoutMs) =>
        new Promise((waitResolve, waitReject) => {
          const existing = messages.find(predicate)
          if (existing !== undefined) {
            waitResolve(existing)
            return
          }
          if (ended) {
            waitReject(
              new Error(`stream ended before match. received: ${describeMessages(messages)}`),
            )
            return
          }

          const timer = setTimeout(() => {
            waitReject(
              new Error(
                `timeout waiting for sse message after ${timeoutMs}ms. received: ${describeMessages(messages)}`,
              ),
            )
          }, timeoutMs)
          waiters.push({
            predicate,
            resolve: waitResolve,
            reject: waitReject,
            timer,
          })
        }),
      waitForEnd: (timeoutMs = defaultWaitTimeoutMs) =>
        new Promise<void>((endResolve, endReject) => {
          if (ended) {
            endResolve()
            return
          }
          const timer = setTimeout(() => {
            endReject(new Error(`timeout waiting for sse stream end after ${timeoutMs}ms`))
          }, timeoutMs)
          endWaiters.push({ resolve: endResolve, reject: endReject, timer })
        }),
      close: () => {
        controller.abort()
        finish()
        return Promise.resolve()
      },
    }

    const headers: Record<string, string> = { accept: "text/event-stream" }
    if (params.credential !== undefined) {
      headers.authorization = `Bearer ${params.credential}`
    }

    const openTimeoutMs = params.openTimeoutMs ?? defaultOpenTimeoutMs
    const openTimer = setTimeout(() => {
      controller.abort()
      if (!opened) {
        reject(new Error(`timeout opening sse stream after ${openTimeoutMs}ms`))
      }
    }, openTimeoutMs)

    fetch(params.url, { headers, signal: controller.signal })
      .then(async (response) => {
        clearTimeout(openTimer)
        if (!response.ok || response.body === null) {
          const detail = await response.text().catch(() => "")
          opened = true
          failWaiters(new Error(`unexpected response ${response.status}: ${detail}`))
          reject(new Error(`unexpected response ${response.status}: ${detail}`))
          return
        }

        opened = true
        resolve(client)

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let dataLines: string[] = []
        const handleLine = (line: string) => {
          if (line === "") {
            if (dataLines.length > 0) {
              const payload = dataLines.join("\n")
              dataLines = []
              try {
                notify(SessionStreamServerMessageSchema.parse(JSON.parse(payload)))
              } catch (error: unknown) {
                const reason = error instanceof Error ? error.message : "parse failed"
                failWaiters(new Error(`invalid sse message: ${reason}. raw=${payload}`))
              }
            }
            return
          }
          if (line.startsWith(":")) {
            if (line.slice(1).trim() === "ping") {
              client.heartbeats += 1
            }
            return
          }
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""))
          }
        }

        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            buffer += decoder.decode(value, { stream: true })
            let newlineIndex = buffer.indexOf("\n")
            while (newlineIndex >= 0) {
              const line = buffer.slice(0, newlineIndex).replace(/\r$/, "")
              buffer = buffer.slice(newlineIndex + 1)
              handleLine(line)
              newlineIndex = buffer.indexOf("\n")
            }
          }
        } catch {
          // Aborted by close() or torn down by the server: both are stream ends.
        }
        finish()
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          finish()
          return
        }
        failWaiters(error instanceof Error ? error : new Error("sse stream failed"))
        reject(error)
      })
  })

export type SessionCommands = {
  prompt: (input: {
    agentId: string
    sessionId: string
    text: string
    attachments?: unknown
  }) => Promise<Response>
  cancel: (input: { agentId: string; sessionId: string }) => Promise<Response>
  replyPermission: (input: { requestId: string; optionId: string }) => Promise<Response>
  replyExtension: (input: { requestId: string; result: unknown }) => Promise<Response>
}

/** Client→server REST commands for the session stream protocol. */
export const createSessionCommands = (params: {
  httpBase: string
  credential: string
}): SessionCommands => {
  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(`${params.httpBase}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${params.credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })

  return {
    prompt: ({ agentId, sessionId, text, attachments }) =>
      post(sessionPromptsPath(sessionId, { agentId }), {
        text,
        ...(attachments === undefined ? {} : { attachments }),
      }),
    cancel: ({ agentId, sessionId }) => post(sessionCancelPath(sessionId, { agentId }), {}),
    replyPermission: ({ requestId, optionId }) =>
      post(permissionRepliesPath(requestId), { optionId }),
    replyExtension: ({ requestId, result }) => post(extensionRepliesPath(requestId), { result }),
  }
}
