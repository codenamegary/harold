import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, fireEvent, waitFor } from "@testing-library/react"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { SessionCollectionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { AppRoutes } from "../shell/AppRouter"

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

const workspaceCollection = WorkspaceCollectionSchema.parse({
  items: [
    {
      id: "ws_01",
      name: "agent-server",
      path: "/home/operator/agent-server",
      state: "available",
      createdAt: "2026-07-24T12:00:00.000Z",
      lastUsedAt: "2026-07-24T12:05:00.000Z",
    },
  ],
  page: { limit: 20, count: 1 },
})

const agentsCollection = AgentSettingsCollectionSchema.parse({
  items: [
    {
      id: "cursor",
      displayName: "Cursor",
      available: true,
      enabled: true,
      path: "/usr/local/bin/agent",
    },
  ],
})

const selectedSession = {
  id: "sess_01SELECTED000000000000001",
  workspaceId: "ws_01",
  agentId: "cursor" as const,
  name: "Selected chat",
  state: "idle" as const,
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:00:00.000Z",
  archivedAt: null,
}

const otherSession = {
  id: "sess_01OTHER00000000000000002",
  workspaceId: "ws_01",
  agentId: "cursor" as const,
  name: "Background chat",
  state: "idle" as const,
  createdAt: "2026-07-24T12:01:00.000Z",
  lastUsedAt: "2026-07-24T12:01:00.000Z",
  archivedAt: null,
}

const sessionsList = SessionCollectionSchema.parse({
  items: [selectedSession, otherSession],
  page: { limit: 100, count: 2 },
})

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

const isSessionEventSocket = (socket: FakeSocket, sessionId: string) =>
  socket.url.includes("/v1/events") &&
  socket.url.includes(`sessionId=${sessionId}`)

describe("App live session list", () => {
  const sockets: FakeSocket[] = []

  beforeEach(() => {
    sockets.length = 0

    globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
      const socket = createFakeSocket(String(url))
      sockets.push(socket)
      return socket
    } as unknown as typeof WebSocket

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/status" || url.startsWith("/v1/status?")) {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(workspaceCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/settings/agents")) {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (
        url.startsWith(`/v1/sessions/${selectedSession.id}/select`) &&
        method === "POST"
      ) {
        return Promise.resolve(
          new Response(JSON.stringify(selectedSession), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (
        url.startsWith(`/v1/sessions/${otherSession.id}/select`) &&
        method === "POST"
      ) {
        return Promise.resolve(
          new Response(JSON.stringify(otherSession), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/sessions")) {
        return Promise.resolve(
          new Response(JSON.stringify(sessionsList), {
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

  test("session list updates from app stream while another session is selected", async () => {
    const { getByLabelText } = renderWithProviders(<AppRoutes />, {
      initialEntries: ["/chat"],
    })

    await waitFor(() => {
      expect(getByLabelText("Workspace")).not.toBeDisabled()
    })

    fireEvent.change(getByLabelText("Workspace"), { target: { value: "ws_01" } })
    fireEvent.change(getByLabelText("Agent"), { target: { value: "cursor" } })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveTextContent("Selected chat · idle")
      expect(getByLabelText("Session")).toHaveTextContent("Background chat · idle")
    })

    fireEvent.change(getByLabelText("Session"), {
      target: { value: selectedSession.id },
    })

    await waitFor(() => {
      expect((getByLabelText("Session") as HTMLSelectElement).value).toBe(
        selectedSession.id,
      )
    })

    await waitFor(() => {
      expect(sockets.some(isAppEventSocket)).toBe(true)
      expect(sockets.some((socket) => isSessionEventSocket(socket, selectedSession.id))).toBe(
        true,
      )
    })

    const appSocket = sockets.find(isAppEventSocket)
    expect(appSocket).toBeDefined()

    const sessionSelect = getByLabelText("Session")
    expect(sessionSelect).toHaveTextContent("Background chat · idle")

    act(() => {
      appSocket?.dispatch(
        "message",
        JSON.stringify([
          {
            type: "session.state",
            cursor: "42",
            occurredAt: "2026-07-24T12:02:00.000Z",
            workspaceId: "ws_01",
            sessionId: otherSession.id,
            payload: {
              sessionId: otherSession.id,
              state: "running",
            },
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(sessionSelect).toHaveTextContent("Background chat · running")
    })

    expect(getByLabelText("Session")).toHaveValue(selectedSession.id)
    expect(sessionSelect).toHaveTextContent("Selected chat · idle")
  })

  test("switching selected session keeps the app stream open", async () => {
    const { getByLabelText } = renderWithProviders(<AppRoutes />, {
      initialEntries: ["/chat"],
    })

    await waitFor(() => {
      expect(getByLabelText("Workspace")).not.toBeDisabled()
    })

    fireEvent.change(getByLabelText("Workspace"), { target: { value: "ws_01" } })
    fireEvent.change(getByLabelText("Agent"), { target: { value: "cursor" } })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveTextContent("Selected chat · idle")
    })

    fireEvent.change(getByLabelText("Session"), {
      target: { value: selectedSession.id },
    })

    await waitFor(() => {
      expect((getByLabelText("Session") as HTMLSelectElement).value).toBe(
        selectedSession.id,
      )
    })

    const appSocketBefore = sockets.find(isAppEventSocket)
    expect(appSocketBefore).toBeDefined()
    expect(appSocketBefore?.readyState).toBe(1)

    fireEvent.change(getByLabelText("Session"), {
      target: { value: otherSession.id },
    })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveValue(otherSession.id)
    })

    await waitFor(() => {
      expect(sockets.some((socket) => isSessionEventSocket(socket, otherSession.id))).toBe(
        true,
      )
    })

    expect(appSocketBefore?.readyState).toBe(1)
    expect(sockets.filter(isAppEventSocket)).toHaveLength(1)

    act(() => {
      appSocketBefore?.dispatch(
        "message",
        JSON.stringify([
          {
            type: "session.state",
            cursor: "43",
            occurredAt: "2026-07-24T12:03:00.000Z",
            workspaceId: "ws_01",
            sessionId: selectedSession.id,
            payload: {
              sessionId: selectedSession.id,
              state: "error",
            },
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveTextContent("Selected chat · error")
    })
  })
})
