import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { defaultAuthSummary } from "../test/agent.settings.fixtures"
import { act, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { SessionCollectionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
import { FakeSocket, installFakeWebSocket, sentStreamMessages } from "../test/fake.websocket"
import { ChatPage } from "../shell/pages/ChatPage"
import {
  clearChatTestSelection,
  joinSessionByName,
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
      state: { status: "stopped", error: null },
      capabilities: null,
      authSummary: defaultAuthSummary,
    },
  ],
})

const workspacePath = "/home/operator/agent-server"

const idleSession = {
  agentId: "cursor" as const,
  sessionId: "sess_01IDLE00000000000000001",
  cwd: workspacePath,
  title: "Idle chat",
  updatedAt: "2026-07-24T12:00:00.000Z",
}

const runningSession = {
  agentId: "cursor" as const,
  sessionId: "sess_01RUNNING00000000000002",
  cwd: workspacePath,
  title: "Running chat",
  updatedAt: "2026-07-24T12:01:00.000Z",
}

const sessionsList = SessionCollectionSchema.parse({
  items: [idleSession, runningSession],
})

const originalFetch = globalThis.fetch

describe("Chat recovery UI", () => {
  const sockets: FakeSocket[] = []
  const restoreWebSocket = { current: () => undefined }

  beforeEach(() => {
    clearChatTestSelection()
    sockets.length = 0
    restoreWebSocket.current = installFakeWebSocket(sockets)
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

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

  const gatewaySocket = () =>
    sockets.find((socket) => socket.url.includes("/v1/sessions/stream"))

  const subscribe = (session: { agentId: string; sessionId: string }) => {
    act(() => {
      gatewaySocket()?.dispatch(
        "message",
        JSON.stringify({
          type: "subscribed",
          agentId: session.agentId,
          sessionId: session.sessionId,
        }),
      )
    })
  }

  test("new session keeps composer enabled with workspace and agent", async () => {
    const { getByRole } = renderChat()
    await startNewSession({ getByRole })
    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
    })
  })

  test("idle session enables composer and shows online status dot", async () => {
    const { getByRole, getByLabelText } = renderChat()
    await joinSessionByName({ getByRole }, idleSession.title)
    subscribe(idleSession)

    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
    })
    expect(getByLabelText("online status")).toBeInTheDocument()
  })

  test("live session_update after subscribe disables composer", async () => {
    const { getByRole } = renderChat()
    await joinSessionByName({ getByRole }, idleSession.title)
    subscribe(idleSession)

    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
    })

    act(() => {
      gatewaySocket()?.dispatch(
        "message",
        JSON.stringify({
          type: "session_update",
          agentId: idleSession.agentId,
          sessionId: idleSession.sessionId,
          update: { sessionUpdate: "agent_message_chunk", text: "working" },
        }),
      )
    })

    await waitFor(() => {
      expect(getByRole("button", { name: "Cancel turn" })).toBeInTheDocument()
    })
    expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
  })

  test("running session disables composer and shows cancel without blocked copy", async () => {
    const { getByRole, queryByText } = renderChat()
    await joinSessionByName({ getByRole }, runningSession.title)
    subscribe(runningSession)

    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
    })

    const textarea = getByRole("textbox", { name: "Chat message" }) as HTMLTextAreaElement
    await act(async () => {
      textarea.value = "go"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })
    fireEvent.click(getByRole("button", { name: "Send message" }))

    await waitFor(() => {
      expect(getByRole("button", { name: "Cancel turn" })).toBeInTheDocument()
    })
    expect(queryByText("Session reconnecting. Prompts unlock when it is idle again.")).toBeNull()
    expect(queryByText("Session ended with an error. Start a new session to continue.")).toBeNull()
  })

  test("offline session disables composer with reconnect copy", async () => {
    const { getByRole, getByText } = renderChat()
    await joinSessionByName({ getByRole }, idleSession.title)
    subscribe(idleSession)

    act(() => {
      gatewaySocket()?.dispatch("close")
    })

    await waitFor(() => {
      expect(
        getByText("Session reconnecting. Prompts unlock when it is idle again."),
      ).toBeInTheDocument()
    })
    expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
  })

  test("error session disables composer with terminal copy", async () => {
    const { getByRole, getByText } = renderChat()
    await joinSessionByName({ getByRole }, idleSession.title)
    subscribe(idleSession)

    act(() => {
      gatewaySocket()?.dispatch(
        "message",
        JSON.stringify({
          type: "error",
          message: "load failed",
          agentId: idleSession.agentId,
          sessionId: idleSession.sessionId,
        }),
      )
    })

    await waitFor(() => {
      expect(
        getByText("Session ended with an error. Start a new session to continue."),
      ).toBeInTheDocument()
    })
    expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
  })

  test("console has no resume control", async () => {
    const { getByRole, queryByRole } = renderChat()
    await joinSessionByName({ getByRole }, idleSession.title)
    expect(queryByRole("button", { name: /resume/i })).not.toBeInTheDocument()
  })

  test("switching sessions does not send cancel", async () => {
    const { getByRole } = renderChat()
    await joinSessionByName({ getByRole }, idleSession.title)
    subscribe(idleSession)
    await joinSessionByName({ getByRole }, runningSession.title)

    expect(sentStreamMessages(gatewaySocket()).some((message) => message.type === "cancel")).toBe(
      false,
    )
    expect(sentStreamMessages(gatewaySocket()).some((message) => message.type === "switch")).toBe(
      true,
    )
  })
})
