import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { defaultAuthSummary } from "../test/agent.settings.fixtures"
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
import { FakeSocket, installFakeWebSocket } from "../test/fake.websocket"
import { ChatPage } from "../shell/pages/ChatPage"
import { clearChatTestSelection, startNewSession } from "../chat/select.combobox.option"

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

describe("Session stream reconnect rebuild", () => {
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
    const field = getByRole("textbox", { name: "Chat message" })
    await waitFor(() => {
      expect(field).not.toHaveAttribute("aria-disabled")
    })
    fireEvent.paste(field, {
      clipboardData: { getData: () => text },
    })
    fireEvent.click(getByRole("button", { name: "Send message" }))
  }

  const gatewaySockets = () =>
    sockets.filter((socket) => socket.url.includes("/v1/sessions/stream"))

  test("close reopens the gateway stream and rebuilds from ACP replay", async () => {
    const { getByRole, getByText, queryByText } = renderChat()
    await startNewSession({ getByRole })
    await typeAndSend(getByRole, "Explain auth")

    await waitFor(() => {
      expect(gatewaySockets().length).toBeGreaterThan(0)
    })

    const first = gatewaySockets()[0]
    act(() => {
      first?.dispatch(
        "message",
        JSON.stringify({
          type: "subscribed",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
        }),
      )
      first?.dispatch(
        "message",
        JSON.stringify({
          type: "session_update",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
          update: { sessionUpdate: "agent_message_chunk", text: "stale" },
        }),
      )
    })

    await waitFor(() => {
      expect(getByText("stale")).toBeInTheDocument()
    })

    const socketsBeforeClose = sockets.length
    act(() => {
      first?.dispatch("close")
    })

    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(socketsBeforeClose)
    })

    expect(queryByText("stale")).not.toBeInTheDocument()

    const reopened = gatewaySockets()[gatewaySockets().length - 1]
    act(() => {
      reopened?.dispatch(
        "message",
        JSON.stringify({
          type: "session_update",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
          update: { sessionUpdate: "agent_message_chunk", text: "Auth uses JWT" },
        }),
      )
      reopened?.dispatch(
        "message",
        JSON.stringify({
          type: "subscribed",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
        }),
      )
      reopened?.dispatch(
        "message",
        JSON.stringify({
          type: "prompt_complete",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
        }),
      )
    })

    await waitFor(() => {
      expect(getByRole("region", { name: "Chat transcript" })).toHaveTextContent("Auth uses JWT")
    })
    expect(queryByText("stale")).not.toBeInTheDocument()
    expect(getByRole("textbox", { name: "Chat message" })).not.toHaveAttribute(
      "aria-disabled",
    )
  })

  test("error reopens the gateway stream", async () => {
    const { getByRole } = renderChat()
    await startNewSession({ getByRole })
    await typeAndSend(getByRole, "Explain auth")

    await waitFor(() => {
      expect(gatewaySockets().length).toBeGreaterThan(0)
    })

    const first = gatewaySockets()[0]
    const socketsBeforeError = sockets.length
    act(() => {
      first?.dispatch("error")
    })

    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(socketsBeforeError)
    })
    expect(gatewaySockets()[gatewaySockets().length - 1]?.url).toContain("/v1/sessions/stream")
  })
})
