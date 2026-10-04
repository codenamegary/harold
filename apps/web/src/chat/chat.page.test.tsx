import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { defaultAuthSummary } from "../test/agent.settings.fixtures"
import { act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { CreateSessionResponseSchema, SessionCollectionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
import { FakeSocket, installFakeWebSocket } from "../test/fake.websocket"
import { ChatPage } from "../shell/pages/ChatPage"
import {
  clearChatTestSelection,
  openNewSessionModal,
  confirmNewSessionModal,
} from "./select.combobox.option"

const workspaceCollection = WorkspaceCollectionSchema.parse({
  items: [
    {
      id: "ws_01",
      name: "harold",
      path: "/home/operator/harold",
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
      state: { status: "stopped", error: null },
      capabilities: null,
      authSummary: defaultAuthSummary,
    },
  ],
})

const createdSession = CreateSessionResponseSchema.parse({
  agentId: "cursor",
  sessionId: "sess_01JFC8C7E77NQCFH0RF9Z22JHH",
  cwd: "/home/operator/harold",
  title: "Explain auth",
  updatedAt: "2026-07-24T12:00:00.000Z",
  configOptions: [],
})

// The catalog reflects created sessions, as the live host does.
const sessionsList = SessionCollectionSchema.parse({
  items: [
    {
      agentId: createdSession.agentId,
      sessionId: createdSession.sessionId,
      cwd: createdSession.cwd,
      title: createdSession.title,
      updatedAt: createdSession.updatedAt,
    },
  ],
})

const originalFetch = globalThis.fetch

describe("ChatPage", () => {
  const sockets: FakeSocket[] = []
  const restoreWebSocket = { current: () => undefined }

  beforeEach(() => {
    clearChatTestSelection()
    sockets.length = 0
    restoreWebSocket.current = installFakeWebSocket(sockets)
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === "/v1/sessions" && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(createdSession), {
            status: 201,
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
    expect(
      getByText("Send a prompt directly to an agent without leaving the console."),
    ).toBeInTheDocument()
  })

  test("session picker lists recent sessions without All sessions or New session", async () => {
    const { getByRole, queryByRole } = renderChatPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(getByRole("button", { name: "Session" })).not.toBeDisabled()
    })
    expect(getByRole("button", { name: "All sessions" })).toBeInTheDocument()
    expect(getByRole("button", { name: "New session" })).toBeInTheDocument()

    await user.click(getByRole("button", { name: "Session" }))
    await waitFor(() => {
      expect(getByRole("listbox", { name: "Session" })).toBeInTheDocument()
    })
    expect(queryByRole("option", { name: /All sessions/ })).not.toBeInTheDocument()
    expect(queryByRole("option", { name: /See all sessions/ })).not.toBeInTheDocument()
    expect(queryByRole("option", { name: /New session/ })).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
  })

  test("new session modal creates the session and the composer enables once subscribed", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    const { getByRole, queryByRole } = renderChatPage()

    await waitFor(() => {
      expect(getByRole("button", { name: "Session" })).not.toBeDisabled()
    })

    await openNewSessionModal({ getByRole })

    await waitFor(() => {
      expect(getByRole("dialog", { name: "New session" })).toBeInTheDocument()
    })

    await confirmNewSessionModal(
      { getByRole, queryByRole },
      { workspaceName: "harold", agentName: "Cursor" },
    )

    const create = fetchMock.mock.calls.find(
      ([input, init]) =>
        requestUrl(input) === "/v1/sessions" &&
        (init as RequestInit | undefined)?.method === "POST",
    )
    expect(create).toBeDefined()

    await waitFor(() => {
      expect(sockets.some((socket) => socket.url.includes("/v1/sessions/stream"))).toBe(true)
    })
    act(() => {
      sockets
        .find((socket) => socket.url.includes("/v1/sessions/stream"))
        ?.dispatch(
          "message",
          JSON.stringify({
            type: "subscribed",
            agentId: createdSession.agentId,
            sessionId: createdSession.sessionId,
          }),
        )
    })

    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).not.toHaveAttribute("aria-disabled")
    })
    expect(getByRole("button", { name: "Session" })).toHaveTextContent("Explain auth")
    expect(getByRole("main").ownerDocument.body).toHaveTextContent("harold · Cursor")
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
      "aria-placeholder",
      "Ask the agent…",
    )
  })
})
