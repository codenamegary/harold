import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, fireEvent, waitFor } from "@testing-library/react"
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

const isAppEventSocket = (socket: FakeSocket) =>
  socket.url.includes("/v1/events") &&
  !socket.url.includes("sessionId=") &&
  !socket.url.includes("workspaceId=") &&
  !socket.url.includes("cursor=")

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

  test("manual refresh still refetches status while online", async () => {
    statusReachable.value = true

    const { getByRole, getByText } = renderWithProviders(<AppRoutes />, {
      initialEntries: ["/"],
    })

    await waitFor(() => {
      expect(getByText("API connected")).toBeInTheDocument()
    })

    const initialStatusCalls = statusCallCount.value

    fireEvent.click(getByRole("button", { name: "Refresh data" }))

    await waitFor(() => {
      expect(statusCallCount.value).toBe(initialStatusCalls + 1)
    })
  })

  test("app stream close reopens and refetches status", async () => {
    statusReachable.value = true

    const { getByText } = renderWithProviders(<AppRoutes />, {
      initialEntries: ["/"],
    })

    await waitFor(() => {
      expect(getByText("API connected")).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(sockets.some(isAppEventSocket)).toBe(true)
    })

    const appSocket = sockets.find(isAppEventSocket)
    expect(appSocket).toBeDefined()

    const socketsBeforeClose = sockets.length
    const statusBeforeClose = statusCallCount.value

    act(() => {
      appSocket?.dispatch("close")
    })

    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(socketsBeforeClose)
    })

    expect(sockets.slice(socketsBeforeClose).some(isAppEventSocket)).toBe(true)

    await waitFor(() => {
      expect(statusCallCount.value).toBeGreaterThan(statusBeforeClose)
    })
  })
})
