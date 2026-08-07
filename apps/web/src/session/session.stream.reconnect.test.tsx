import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import {
  CreateSessionResponseSchema,
  SessionCollectionSchema,
} from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { ChatPage } from "../shell/pages/ChatPage"
import {
  clearChatTestSelection,
  joinSessionByName,
  startNewSession,
} from "../chat/select.combobox.option"

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

const createdSession = CreateSessionResponseSchema.parse({
  id: "sess_01JFC8C7E77NQCFH0RF9Z22JHH",
  workspaceId: "ws_01",
  agentId: "cursor",
  name: "Explain auth",
  state: "running",
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:00:00.000Z",
  archivedAt: null,
  turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
})

const sessionsList = SessionCollectionSchema.parse({
  items: [
    {
      id: createdSession.id,
      workspaceId: createdSession.workspaceId,
      agentId: createdSession.agentId,
      name: createdSession.name,
      state: "idle",
      createdAt: createdSession.createdAt,
      lastUsedAt: createdSession.lastUsedAt,
      archivedAt: null,
    },
  ],
  page: { limit: 100, count: 1 },
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

const isSessionEventSocket = (socket: FakeSocket, sessionId: string) =>
  socket.url.includes("/v1/events") && socket.url.includes(`sessionId=${sessionId}`)

describe("Session stream reconnect rebuild", () => {
  const sockets: FakeSocket[] = []

  beforeEach(() => {
    clearChatTestSelection()
    sockets.length = 0

    globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
      const socket = createFakeSocket(String(url))
      sockets.push(socket)
      return socket
    } as unknown as typeof WebSocket

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

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

      if (url === "/v1/sessions" && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(createdSession), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith(`/v1/sessions/${createdSession.id}/select`) && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(sessionsList.items[0]), {
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
    clearChatTestSelection()
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  })

  const renderChat = () =>
    renderWithProviders(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )

  const selectWorkspaceAndAgent = async (
    getByRole: ReturnType<typeof renderChat>["getByRole"],
  ) => {
    await startNewSession({ getByRole })
  }

  const typeAndSend = async (
    getByRole: ReturnType<typeof renderChat>["getByRole"],
    text: string,
  ) => {
    const textarea = getByRole("textbox", { name: "Chat message" }) as HTMLTextAreaElement
    await waitFor(() => {
      expect(textarea).not.toBeDisabled()
    })

    await act(async () => {
      textarea.value = text
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })

    await waitFor(() => {
      expect(getByRole("button", { name: "Send message" })).not.toBeDisabled()
    })

    fireEvent.click(getByRole("button", { name: "Send message" }))
  }

  test("close reopens stream and rebuilds transcript from journal replay only", async () => {
    const { getByLabelText, getByRole, queryByText } = renderChat()
    await selectWorkspaceAndAgent(getByRole)
    await typeAndSend(getByRole, "Explain auth")

    await waitFor(() => {
      expect(getByRole("combobox", { name: "Session" })).toHaveValue(createdSession.name)
    })

    await waitFor(() => {
      expect(
        sockets.some((socket) => isSessionEventSocket(socket, createdSession.id)),
      ).toBe(true)
    })

    const firstSocket = sockets.find((socket) =>
      isSessionEventSocket(socket, createdSession.id),
    )
    expect(firstSocket).toBeDefined()
    expect(firstSocket?.url).toContain("cursor=0")

    act(() => {
      firstSocket?.dispatch(
        "message",
        JSON.stringify([
          {
            type: "turn.started",
            cursor: "1",
            occurredAt: "2026-07-24T12:00:00.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              turnId: createdSession.turnId,
              text: "Explain auth",
            },
          },
          {
            type: "session.output.delta",
            cursor: "2",
            occurredAt: "2026-07-24T12:00:01.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              turnId: createdSession.turnId,
              text: "Auth uses JWT",
            },
          },
          {
            type: "session.state",
            cursor: "3",
            occurredAt: "2026-07-24T12:00:02.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              sessionId: createdSession.id,
              state: "idle",
            },
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(getByRole("region", { name: "Chat transcript" })).toHaveTextContent(
        "Auth uses JWT",
      )
    })

    const socketsBeforeClose = sockets.length

    act(() => {
      firstSocket?.dispatch("close")
    })

    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(socketsBeforeClose)
    })

    const reopened = sockets
      .slice(socketsBeforeClose)
      .find((socket) => isSessionEventSocket(socket, createdSession.id))
    expect(reopened).toBeDefined()
    expect(reopened?.url).toContain("cursor=0")

    await waitFor(() => {
      expect(queryByText("Auth uses JWT")).not.toBeInTheDocument()
    })

    act(() => {
      reopened?.dispatch(
        "message",
        JSON.stringify([
          {
            type: "turn.started",
            cursor: "1",
            occurredAt: "2026-07-24T12:00:00.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              turnId: createdSession.turnId,
              text: "Explain auth",
            },
          },
          {
            type: "session.output.delta",
            cursor: "2",
            occurredAt: "2026-07-24T12:00:01.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              turnId: createdSession.turnId,
              text: "Auth uses JWT",
            },
          },
          {
            type: "session.state",
            cursor: "3",
            occurredAt: "2026-07-24T12:00:02.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              sessionId: createdSession.id,
              state: "idle",
            },
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(getByRole("region", { name: "Chat transcript" })).toHaveTextContent(
        "Auth uses JWT",
      )
    })
    expect(getByRole("region", { name: "Chat transcript" })).toHaveTextContent(
      "Explain auth",
    )
    expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
  })

  test("error reopens stream with cursor 0 after clear for full replay", async () => {
    const { getByLabelText, getByRole } = renderChat()
    await selectWorkspaceAndAgent(getByRole)
    await typeAndSend(getByRole, "Explain auth")

    await waitFor(() => {
      expect(
        sockets.some((socket) => isSessionEventSocket(socket, createdSession.id)),
      ).toBe(true)
    })

    const firstSocket = sockets.find((socket) =>
      isSessionEventSocket(socket, createdSession.id),
    )
    expect(firstSocket).toBeDefined()

    act(() => {
      firstSocket?.dispatch(
        "message",
        JSON.stringify([
          {
            type: "session.state",
            cursor: "7",
            occurredAt: "2026-07-24T12:00:00.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              sessionId: createdSession.id,
              state: "idle",
            },
          },
        ]),
      )
    })

    const socketsBeforeError = sockets.length

    act(() => {
      firstSocket?.dispatch("error")
    })

    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(socketsBeforeError)
    })

    const reopened = sockets
      .slice(socketsBeforeError)
      .find((socket) => isSessionEventSocket(socket, createdSession.id))
    expect(reopened).toBeDefined()
    // Clear + full replay from 0 is the correct rebuild after onReconnect clears transcript.
    expect(reopened?.url).toContain("cursor=0")
  })
})
