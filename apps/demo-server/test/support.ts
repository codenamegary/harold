import { z } from "zod"
import { SessionStreamServerMessageSchema } from "contracts/http/session.stream"
import { DemoAppOptions } from "../src/demo.context"
import { createDemoApp } from "../src/server"

export type TestFrame = z.infer<typeof SessionStreamServerMessageSchema>

export type TestServer = {
  url: string
  app: ReturnType<typeof createDemoApp>
  stop: () => Promise<void>
}

export const startTestServer = (options: DemoAppOptions = {}): TestServer => {
  const app = createDemoApp({
    turnDelayMs: 0,
    interactionTimeoutMs: 0,
    heartbeatMs: 60_000,
    ...options,
  })
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: app.fetch,
    idleTimeout: 255,
  })

  return {
    url: `http://127.0.0.1:${server.port}`,
    app,
    stop: async () => {
      app.stop()
      await server.stop(true)
    },
  }
}

export const claimDevice = async (
  server: TestServer,
  code = "DEM-O01",
  body = JSON.stringify({ name: "Reviewer phone", platform: "ios" }),
): Promise<{ response: Response; credential: string; deviceId: string; json: unknown }> => {
  const response = await fetch(`${server.url}/v1/pairing-codes/${code}/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  })
  const json: unknown = await response.json()
  const record = json as { credential?: string; device?: { id?: string } }
  return {
    response,
    credential: record.credential ?? "",
    deviceId: record.device?.id ?? "",
    json,
  }
}

export const authedFetch = (
  server: TestServer,
  credential: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${credential}`)
  return fetch(`${server.url}${path}`, {
    ...init,
    headers,
  })
}

export const readJson = async <T extends z.ZodTypeAny>(
  response: Response,
  schema: T,
): Promise<z.infer<T>> => {
  const text = await response.text()
  const parsed: unknown = JSON.parse(text)
  return schema.parse(parsed)
}

export type OpenSseOptions = {
  server: TestServer
  credential: string
  sessionId: string
  agentId?: string
}

export type TestSse = {
  frames: TestFrame[]
  waitFor: (
    predicate: (frame: TestFrame) => boolean,
    options?: { after?: number; timeoutMs?: number },
  ) => Promise<{ frame: TestFrame; index: number }>
  count: (predicate: (frame: TestFrame) => boolean) => number
  close: () => Promise<void>
}

export const openSse = async (options: OpenSseOptions): Promise<TestSse> => {
  const agentId = options.agentId ?? "opencode"
  const controller = new AbortController()
  const response = await fetch(
    `${options.server.url}/v1/sessions/${encodeURIComponent(options.sessionId)}/events?agentId=${encodeURIComponent(agentId)}`,
    {
      headers: {
        authorization: `Bearer ${options.credential}`,
        accept: "text/event-stream",
      },
      signal: controller.signal,
    },
  )
  if (!response.ok) {
    throw new Error(`SSE open failed with ${response.status}`)
  }
  const body = response.body
  if (body === null) {
    throw new Error("SSE response had no body")
  }

  const frames: TestFrame[] = []
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const pump = async (): Promise<void> => {
    try {
      while (true) {
        const result = await reader.read()
        if (result.done) {
          return
        }
        buffer += decoder.decode(result.value, { stream: true })
        let index = buffer.indexOf("\n\n")
        while (index >= 0) {
          const block = buffer.slice(0, index)
          buffer = buffer.slice(index + 2)
          for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) {
              continue
            }
            const parsed: unknown = JSON.parse(line.slice("data: ".length))
            frames.push(SessionStreamServerMessageSchema.parse(parsed))
          }
          index = buffer.indexOf("\n\n")
        }
      }
    } catch {
      // Closing the client aborts the read.
    }
  }

  const pumping = pump()

  const waitFor: TestSse["waitFor"] = async (predicate, waitOptions = {}) => {
    const after = waitOptions.after ?? 0
    const timeoutMs = waitOptions.timeoutMs ?? 3_000
    const deadline = Date.now() + timeoutMs
    while (Date.now() <= deadline) {
      for (let index = after; index < frames.length; index += 1) {
        const frame = frames[index]
        if (frame !== undefined && predicate(frame)) {
          return { frame, index }
        }
      }
      await Bun.sleep(5)
    }
    throw new Error(
      `Timed out waiting for frame after ${after}; got ${frames
        .slice(after)
        .map((frame) => frame.type)
        .join(",")}`,
    )
  }

  return {
    frames,
    waitFor,
    count: (predicate) => frames.filter(predicate).length,
    close: async () => {
      controller.abort()
      try {
        await reader.cancel()
      } catch {
        // Already closed.
      }
      await pumping
    },
  }
}
