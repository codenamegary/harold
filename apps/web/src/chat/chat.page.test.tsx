import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { SessionCollectionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
import { FakeSocket, installFakeWebSocket } from "../test/fake.websocket"
import { ChatPage } from "../shell/pages/ChatPage"
import { clearChatTestSelection, openNewSessionModal, confirmNewSessionModal } from "./select.combobox.option"

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
    },
    {
      id: "claude-acp",
      displayName: "Claude Agent",
      available: true,
      enabled: false,
      path: null,
      args: [],
      present: true,
      popular: true,
      deletable: false,
  sessionListSupported: true,
    },
  ],
})

const emptySessions = SessionCollectionSchema.parse({
  items: [],
})

const originalFetch = globalThis.fetch

describe("ChatPage", () => {
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
          new Response(JSON.stringify(emptySessions), {
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

  const renderChatPage = () =>
    renderWithProviders(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )

  test("renders page landmark and welcome copy", async () => {
    const { getByRole, getByText } = renderChatPage()

    expect(getByRole("main")).toBeInTheDocument()
    await waitFor(() => {
      expect(getByRole("heading", { level: 3, name: "Chat with an agent" })).toBeInTheDocument()
    })
    expect(getByText("Send a prompt directly to an agent without leaving the console.")).toBeInTheDocument()
  })

  test("session picker is available for join or new", async () => {
    const { getByRole } = renderChatPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(getByRole("button", { name: "Session" })).not.toBeDisabled()
    })

    await user.click(getByRole("button", { name: "Session" }))
    await waitFor(() => {
      expect(getByRole("option", { name: /New session/ })).toBeInTheDocument()
    })
    await user.keyboard("{Escape}")
  })

  test("new session modal enables composer after workspace and agent are chosen", async () => {
    const { getByRole } = renderChatPage()

    await waitFor(() => {
      expect(getByRole("button", { name: "Session" })).not.toBeDisabled()
    })

    await openNewSessionModal({ getByRole })

    await waitFor(() => {
      expect(getByRole("dialog", { name: "New session" })).toBeInTheDocument()
    })

    await confirmNewSessionModal(
      { getByRole },
      { workspaceName: "agent-server", agentName: "Cursor" },
    )

    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
    })
    expect(getByRole("button", { name: "Send message" })).toBeDisabled()
    expect(getByRole("button", { name: "Session" })).toHaveTextContent("New session")
    expect(getByRole("main").ownerDocument.body).toHaveTextContent("agent-server · Cursor")
  })

  test("prototype slash menu, prompt chips, and attach are gone", async () => {
    const { getByRole, queryByRole, queryByText } = renderChatPage()

    await waitFor(() => {
      expect(getByRole("heading", { level: 3, name: "Chat with an agent" })).toBeInTheDocument()
    })

    expect(queryByRole("menu", { name: "Slash commands" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "Summarize this workspace" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "Add attachment" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "Clear chat" })).not.toBeInTheDocument()
    expect(queryByText("ACP v0.8")).not.toBeInTheDocument()
    expect(getByRole("textbox", { name: "Chat message" })).toHaveAttribute(
      "placeholder",
      "Ask the agent…",
    )
  })
})
