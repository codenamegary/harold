import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, waitFor } from "@testing-library/react"
import { DeviceCollectionSchema, DeviceState } from "contracts/http/device"
import { renderWithProviders } from "../query/render.with.providers"
import { hrefOf, requestUrl } from "../test/request.url"
import { AppRoutes } from "../shell/AppRouter"

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

const deviceCollection = (state: DeviceState) =>
  DeviceCollectionSchema.parse({
    items: [
      {
        id: "dev_desktop",
        name: "Studio Desktop",
        platform: "macOS",
        state,
        pairedAt: "2026-08-02T18:00:00.000Z",
        lastSeenAt: "2026-08-02T20:55:00.000Z",
      },
    ],
    page: { limit: 100, count: 1 },
  })

const createFakeSocket = (url: string): FakeSocket => {
  const listeners = new Map<string, Array<(event: { data?: string }) => void>>()

  const socket: FakeSocket = {
    url,
    readyState: 1,
    close: () => {
      socket.readyState = 3
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

describe("Devices live events", () => {
  const sockets: FakeSocket[] = []
  const backend = { deviceState: "offline" as DeviceState }

  beforeEach(() => {
    sockets.length = 0
    backend.deviceState = "offline"

    globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
      const socket = createFakeSocket(hrefOf(url))
      sockets.push(socket)
      return socket
    } as unknown as typeof WebSocket

    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url.startsWith("/v1/status")) {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/devices")) {
        return Promise.resolve(
          new Response(JSON.stringify(deviceCollection(backend.deviceState)), {
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

  test("device connected event refreshes the Devices table", async () => {
    const { getByText } = renderWithProviders(<AppRoutes />, {
      initialEntries: ["/devices"],
    })

    await waitFor(() => {
      expect(getByText("Studio Desktop")).toBeInTheDocument()
      expect(getByText("Offline")).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(sockets.some(isAppEventSocket)).toBe(true)
    })

    const appSocket = sockets.find(isAppEventSocket)
    backend.deviceState = "online"

    act(() => {
      appSocket?.dispatch(
        "message",
        JSON.stringify([
          {
            type: "device.connected",
            cursor: "200",
            occurredAt: "2026-08-02T21:05:00.000Z",
            payload: {
              deviceId: "dev_desktop",
            },
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(getByText("Online")).toBeInTheDocument()
    })
  })
})
