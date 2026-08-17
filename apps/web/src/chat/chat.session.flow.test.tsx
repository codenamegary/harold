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
import { requestUrl } from "../test/request.url"
import { FakeSocket, installFakeWebSocket, sentStreamMessages } from "../test/fake.websocket"
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
      deletable: false,
      sessionListSupported: true,
      state: { status: "stopped", error: null },
    },
  ],
})

const workspacePath = "/home/operator/agent-server"

const createdSession = CreateSessionResponseSchema.parse({
  agentId: "cursor",
  sessionId: "sess_01JFC8C7E77NQCFH0RF9Z22JHH",
  cwd: workspacePath,
  title: "Explain auth",
  updatedAt: "2026-07-24T12:00:00.000Z",
})

const sessionsList = SessionCollectionSchema.parse({
  items: [createdSession],
})

const originalFetch = globalThis.fetch

describe("Chat session flow", () => {
  const sockets: FakeSocket[] = []
  const restoreWebSocket = { current: () => undefined }

  beforeEach(() => {
    clearChatTestSelection()
    sockets.length = 0
    restoreWebSocket.current = installFakeWebSocket(sockets)

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
    restoreWebSocket.current()
  })

  const renderChat = () =>
    renderWithProviders(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )

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

  const gatewaySocket = () =>
    sockets.find((socket) => socket.url.includes("/v1/sessions/stream"))

  test("create-with-prompt subscribes on the gateway stream and renders ACP updates", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    const { getByRole } = renderChat()
    await startNewSession({ getByRole })
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
      expect(getByRole("button", { name: "Session" })).toHaveTextContent(createdSession.title)
    })

    await waitFor(() => {
      expect(gatewaySocket()).toBeDefined()
    })

    const socket = gatewaySocket()
    expect(socket?.url).toContain("/v1/sessions/stream")

    act(() => {
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "subscribed",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
        }),
      )
    })

    await waitFor(() => {
      expect(sentStreamMessages(socket).some((message) => message.type === "subscribe")).toBe(
        true,
      )
      expect(sentStreamMessages(socket).some((message) => message.type === "prompt")).toBe(true)
    })

    act(() => {
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "session_update",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
          update: {
            sessionUpdate: "agent_thought_chunk",
            text: "thinking",
          },
        }),
      )
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "session_update",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Auth uses JWT" },
          },
        }),
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

  test("cancel and a later prompt go on the gateway stream", async () => {
    const { getByRole } = renderChat()
    await startNewSession({ getByRole })
    await typeAndSend(getByRole, "Explain auth")

    await waitFor(() => {
      expect(getByRole("button", { name: "Session" })).toHaveTextContent(createdSession.title)
    })

    const socket = gatewaySocket()
    act(() => {
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "subscribed",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
        }),
      )
    })

    await waitFor(() => {
      expect(getByRole("button", { name: "Cancel turn" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Cancel turn" }))

    await waitFor(() => {
      expect(sentStreamMessages(socket).some((message) => message.type === "cancel")).toBe(true)
    })

    act(() => {
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "cancelled",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
        }),
      )
    })

    await waitFor(() => {
      expect(getByRole("button", { name: "Send message" })).toBeInTheDocument()
    })

    await typeAndSend(getByRole, "Second prompt")

    await waitFor(() => {
      expect(
        sentStreamMessages(socket).filter((message) => message.type === "prompt"),
      ).toHaveLength(2)
    })
  })

  test("switch clears transcript then load replay fills it", async () => {
    const { getByRole, getByText, queryByText } = renderChat()
    await startNewSession({ getByRole })
    await typeAndSend(getByRole, "Explain auth")

    await waitFor(() => {
      expect(gatewaySocket()).toBeDefined()
    })

    const socket = gatewaySocket()
    act(() => {
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "subscribed",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
        }),
      )
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "session_update",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            text: "stale",
          },
        }),
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
    await joinSessionByName({ getByRole }, createdSession.title)

    await waitFor(() => {
      expect(queryByText("stale")).not.toBeInTheDocument()
    })

    act(() => {
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "subscribed",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
        }),
      )
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "session_update",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "tool_01",
            toolName: "read",
            kind: "read",
            status: "pending",
          },
        }),
      )
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "session_update",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            text: "rebuilt",
          },
        }),
      )
    })

    await waitFor(() => {
      expect(getByText("rebuilt")).toBeInTheDocument()
    })
    expect(getByText("1 tool call · 1 running")).toBeInTheDocument()
    expect(getByText("read · pending")).toBeInTheDocument()
    expect(queryByText("stale")).not.toBeInTheDocument()
  })

  test("permission reply goes on the gateway stream", async () => {
    const { getByRole } = renderChat()
    await startNewSession({ getByRole })
    await typeAndSend(getByRole, "Explain auth")

    await waitFor(() => {
      expect(gatewaySocket()).toBeDefined()
    })

    const socket = gatewaySocket()
    act(() => {
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "subscribed",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
        }),
      )
      socket?.dispatch(
        "message",
        JSON.stringify({
          type: "permission_request",
          requestId: "req-1",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
          params: {
            options: [{ optionId: "allow-once", name: "Allow once" }],
            toolCall: { toolCallId: "t1", name: "edit" },
          },
        }),
      )
    })

    await waitFor(() => {
      expect(getByRole("button", { name: "Allow once" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Allow once" }))

    await waitFor(() => {
      expect(
        sentStreamMessages(socket).some((message) => message.type === "permission_reply"),
      ).toBe(true)
    })
  })
})
