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
import { hrefOf, requestUrl } from "../test/request.url"
import { ChatPage } from "../shell/pages/ChatPage"
import {
  clearChatTestSelection,
  confirmNewSessionModal,
  joinSessionByName,
  openNewSessionModal,
  startNewSession,
} from "./select.combobox.option"

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
      args: [],
      present: true,
      popular: true,
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
      state: "running",
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

describe("Chat session flow", () => {
  const sockets: FakeSocket[] = []

  beforeEach(() => {
    clearChatTestSelection()
    sockets.length = 0

    globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
      const socket = createFakeSocket(hrefOf(url))
      sockets.push(socket)
      return socket
    } as unknown as typeof WebSocket

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
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

      if (url.startsWith(`/v1/sessions/${createdSession.id}/prompt`) && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHK" }), {
            status: 202,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith(`/v1/sessions/${createdSession.id}/cancel`) && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ turnId: createdSession.turnId }), {
            status: 202,
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

  test("create-with-prompt binds session and opens event stream from cursor 0", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    const { getByRole } = renderChat()
    await selectWorkspaceAndAgent(getByRole)
    await typeAndSend(getByRole, "Explain auth")

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input) === "/v1/sessions" &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true)
    })

    await waitFor(() => {
      expect(getByRole("combobox", { name: "Session" })).toHaveValue(createdSession.name)
    })

    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(0)
    })

    expect(sockets[0]?.url).toContain(`sessionId=${createdSession.id}`)
    expect(sockets[0]?.url).toContain("cursor=0")

    act(() => {
      sockets[0]?.dispatch(
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
            type: "session.thought.delta",
            cursor: "2",
            occurredAt: "2026-07-24T12:00:01.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              turnId: createdSession.turnId,
              text: "thinking",
            },
          },
          {
            type: "session.output.delta",
            cursor: "3",
            occurredAt: "2026-07-24T12:00:02.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              turnId: createdSession.turnId,
              text: "Auth uses JWT",
            },
          },
          {
            type: "session.state",
            cursor: "4",
            occurredAt: "2026-07-24T12:00:03.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              sessionId: createdSession.id,
              state: "running",
            },
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(getByRole("region", { name: "Chat transcript" })).toBeInTheDocument()
    })
    const transcript = getByRole("region", { name: "Chat transcript" })
    expect(transcript).toHaveTextContent("Explain auth")
    expect(transcript).toHaveTextContent("thinking")
    expect(transcript).toHaveTextContent("Auth uses JWT")
    expect(getByRole("button", { name: "Cancel turn" })).toBeInTheDocument()
  })

  test("cancel posts while running and prompt posts on existing session", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    const { getByRole } = renderChat()
    await selectWorkspaceAndAgent(getByRole)
    await typeAndSend(getByRole, "Explain auth")

    await waitFor(() => {
      expect(getByRole("combobox", { name: "Session" })).toHaveValue(createdSession.name)
    })

    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(0)
    })

    act(() => {
      sockets[0]?.dispatch(
        "message",
        JSON.stringify([
          {
            type: "session.state",
            cursor: "1",
            occurredAt: "2026-07-24T12:00:00.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              sessionId: createdSession.id,
              state: "running",
            },
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(getByRole("button", { name: "Cancel turn" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Cancel turn" }))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).includes(`/v1/sessions/${createdSession.id}/cancel`) &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true)
    })

    act(() => {
      sockets[0]?.dispatch(
        "message",
        JSON.stringify([
          {
            type: "session.state",
            cursor: "2",
            occurredAt: "2026-07-24T12:00:01.000Z",
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
      expect(getByRole("button", { name: "Send message" })).toBeInTheDocument()
    })

    await typeAndSend(getByRole, "Second prompt")

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).includes(`/v1/sessions/${createdSession.id}/prompt`) &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true)
    })
  })

  test("reconnect clears and rebuilds transcript from replay", async () => {
    const { getByRole, getByText, queryByText } = renderChat()
    await selectWorkspaceAndAgent(getByRole)
    await typeAndSend(getByRole, "Explain auth")

    await waitFor(() => {
      expect(sockets.length).toBe(1)
    })

    act(() => {
      sockets[0]?.dispatch(
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
              text: "stale",
            },
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(getByText("stale")).toBeInTheDocument()
    })

    await openNewSessionModal({ getByRole })
    await confirmNewSessionModal(
      { getByRole },
      { workspaceName: "agent-server", agentName: "Cursor" },
    )
    await joinSessionByName({ getByRole }, createdSession.name)

    await waitFor(() => {
      expect(sockets.length).toBe(2)
    })

    expect(queryByText("stale")).not.toBeInTheDocument()

    act(() => {
      sockets[1]?.dispatch(
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
            type: "session.tool.started",
            cursor: "2",
            occurredAt: "2026-07-24T12:00:01.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              turnId: createdSession.turnId,
              toolCallId: "tool_01",
              toolName: "read",
              toolKind: "read",
            },
          },
          {
            type: "session.output.delta",
            cursor: "3",
            occurredAt: "2026-07-24T12:00:02.000Z",
            workspaceId: "ws_01",
            sessionId: createdSession.id,
            payload: {
              turnId: createdSession.turnId,
              text: "rebuilt",
            },
          },
        ]),
      )
    })

    await waitFor(() => {
      expect(getByText("rebuilt")).toBeInTheDocument()
    })
    expect(getByText("1 tool call · 1 running")).toBeInTheDocument()
    expect(getByText("read · pending")).toBeInTheDocument()
    expect(queryByText("stale")).not.toBeInTheDocument()
  })
})
