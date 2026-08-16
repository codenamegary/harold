import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { waitFor } from "@testing-library/react"
import { AppRoutes } from "../shell/AppRouter"
import { renderWithProviders } from "../query/render.with.providers"
import { hrefOf, requestUrl } from "../test/request.url"

const validStatus = {
  version: "0.1.0",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-01-01T00:00:00.000Z",
  acp: {
    state: "ready",
    activeSessions: 0,
  },
} as const

type FakeSocket = {
  url: string
  readyState: number
  close: () => void
  send: (data: string) => void
  addEventListener: (type: string, listener: (event: { data?: string }) => void) => void
  dispatch: (type: string, data?: string) => void
}

const originalFetch = globalThis.fetch
const originalWebSocket = globalThis.WebSocket

const createFakeSocket = (url: string): FakeSocket => {
  const listeners = new Map<string, Array<(event: { data?: string }) => void>>()

  const socket: FakeSocket = {
    url,
    readyState: 1,
    close: () => {
      socket.readyState = 3
      const current = listeners.get("close") ?? []
      current.forEach((listener) => listener({}))
    },
    send: () => undefined,
    addEventListener: (type, listener) => {
      const current = listeners.get(type) ?? []
      listeners.set(type, [...current, listener])
    },
    dispatch: (type, data) => {
      const current = listeners.get(type) ?? []
      current.forEach((listener) => listener({ data }))
    },
  }

  return socket
}

describe("Connection status recovery", () => {
  const sockets: FakeSocket[] = []
  const statusReachable = { value: false }
  const statusCallCount = { value: 0 }

  beforeEach(() => {
    sockets.length = 0
    statusReachable.value = false
    statusCallCount.value = 0

    globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
      const socket = createFakeSocket(hrefOf(url))
      sockets.push(socket)
      return socket
    } as unknown as typeof WebSocket

    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url === "/v1/status" || url.startsWith("/v1/status?")) {
        statusCallCount.value += 1
        if (!statusReachable.value) {
          return Promise.reject(new Error("network error"))
        }

        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  })

  test("unreachable chrome recovers to online after polling without full reload", async () => {
    const { getByText, getByRole } = renderWithProviders(<AppRoutes />, {
      initialEntries: ["/"],
    })

    await waitFor(() => {
      expect(getByText("API unreachable")).toBeInTheDocument()
    })

    const callsWhileUnreachable = statusCallCount.value
    expect(callsWhileUnreachable).toBeGreaterThan(0)

    statusReachable.value = true

    await waitFor(
      () => {
        expect(getByText("API connected")).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    expect(statusCallCount.value).toBeGreaterThan(callsWhileUnreachable)
    expect(getByRole("complementary", { name: "Sidebar" })).toBeInTheDocument()
  })

  test("topbar has no refresh or open chat controls", async () => {
    statusReachable.value = true

    const { getByText, queryByRole } = renderWithProviders(<AppRoutes />, {
      initialEntries: ["/"],
    })

    await waitFor(() => {
      expect(getByText("API connected")).toBeInTheDocument()
    })

    expect(queryByRole("button", { name: "Refresh data" })).not.toBeInTheDocument()
    expect(queryByRole("link", { name: /open chat/i })).not.toBeInTheDocument()
  })

  test("console does not open a journal /v1/events socket", async () => {
    statusReachable.value = true

    const { getByText } = renderWithProviders(<AppRoutes />, {
      initialEntries: ["/"],
    })

    await waitFor(() => {
      expect(getByText("API connected")).toBeInTheDocument()
    })

    expect(sockets.some((socket) => socket.url.includes("/v1/events"))).toBe(false)
  })
})
