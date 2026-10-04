import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { defaultAuthSummary } from "../test/agent.settings.fixtures"
import { act, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { CreateSessionResponseSchema, SessionCollectionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
import { FakeSocket, installFakeWebSocket, sentStreamMessages } from "../test/fake.websocket"
import { ChatPage } from "../shell/pages/ChatPage"
import { clearChatTestSelection, startNewSession } from "./select.combobox.option"

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
  ],
})

const workspacePath = "/home/operator/harold"

const sessionConfigOptions = [
  {
    id: "model",
    name: "Model",
    description: "Select the model for this session",
    category: "model",
    type: "select",
    currentValue: "openai/gpt-5.2",
    options: [
      { value: "opencode/big-pickle", name: "Big Pickle", description: null },
      { value: "openai/gpt-5.2", name: "GPT-5.2", description: "Flagship model" },
    ],
  },
  {
    id: "mode",
    name: "Mode",
    description: "Set the interaction mode",
    category: "mode",
    type: "select",
    currentValue: "agent",
    options: [
      { value: "agent", name: "Agent", description: null },
      { value: "ask", name: "Ask", description: null },
    ],
  },
  {
    id: "thought_level",
    name: "Thinking",
    description: "Set the reasoning effort for this session",
    category: "thought_level",
    type: "select",
    currentValue: "medium",
    options: [
      { value: "low", name: "Low", description: null },
      { value: "medium", name: "Medium", description: null },
      { value: "high", name: "High", description: null },
    ],
  },
]

const createdSession = CreateSessionResponseSchema.parse({
  agentId: "cursor",
  sessionId: "sess_01JFC8C7E77NQCFH0RF9Z22JHH",
  cwd: workspacePath,
  title: "Explain auth",
  updatedAt: "2026-07-24T12:00:00.000Z",
  configOptions: sessionConfigOptions,
})

const createdSessionRow = {
  agentId: createdSession.agentId,
  sessionId: createdSession.sessionId,
  cwd: createdSession.cwd,
  title: createdSession.title,
  updatedAt: createdSession.updatedAt,
}

const sessionsList = SessionCollectionSchema.parse({
  items: [createdSessionRow],
})

const sessionConfigFrame = {
  type: "session_config",
  agentId: createdSession.agentId,
  sessionId: createdSession.sessionId,
  configOptions: sessionConfigOptions,
}

const originalFetch = globalThis.fetch

describe("Chat session config flow", () => {
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

      if (url.startsWith("/v1/sessions") && method === "PUT") {
        return Promise.resolve(new Response("", { status: 202 }))
      }

      if (url.startsWith("/v1/settings/agents")) {
        return Promise.resolve(
          new Response(JSON.stringify(agentsCollection), {
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

  const gatewaySocket = () => sockets.find((socket) => socket.url.includes("/v1/sessions/stream"))

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

    await waitFor(() => {
      expect(getByRole("button", { name: "Send message" })).not.toBeDisabled()
    })

    fireEvent.click(getByRole("button", { name: "Send message" }))
  }

  test("session_config frames drive the composer controls and an immediate PUT", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    const { getByRole, queryByRole } = renderChat()
    await startNewSession({ getByRole, queryByRole })

    // Confirming created the session; the composer unlocks once the gateway
    // subscribes to it.
    await waitFor(() => {
      expect(gatewaySocket()).toBeDefined()
    })
    act(() => {
      gatewaySocket()?.dispatch(
        "message",
        JSON.stringify({
          type: "subscribed",
          agentId: createdSession.agentId,
          sessionId: createdSession.sessionId,
        }),
      )
    })

    await typeAndSend(getByRole, "Explain auth")

    const socket = gatewaySocket()
    act(() => {
      socket?.dispatch("message", JSON.stringify(sessionConfigFrame))
    })

    await waitFor(() => {
      expect(sentStreamMessages(socket).some((message) => message.type === "subscribe")).toBe(true)
    })

    const modelLink = getByRole("button", { name: /Model: GPT-5\.2/ })
    expect(modelLink).toBeInTheDocument()
    expect(getByRole("button", { name: /Mode: Agent\. Press for Ask\./ })).toBeInTheDocument()
    expect(
      getByRole("button", { name: /Thinking: Medium, level 2 of 3\. Press for High\./ }),
    ).toBeInTheDocument()

    act(() => {
      fireEvent.click(getByRole("button", { name: /Mode: Agent\. Press for Ask\./ }))
    })

    expect(getByRole("button", { name: /Mode: Ask\. Press for Agent\./ })).toBeInTheDocument()

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([input, init]) =>
          requestUrl(input) ===
            `/v1/sessions/${createdSession.sessionId}/config-options/mode?agentId=cursor` &&
          (init as RequestInit | undefined)?.method === "PUT",
      )
      expect(put).toBeDefined()
      expect(JSON.parse((put?.[1] as RequestInit | undefined)?.body as string)).toEqual({
        value: "ask",
      })
    })
  }, 10_000)

  test("new session confirm creates the session and shows config options before any prompt", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    const { getByRole, queryByRole } = renderChat()

    await startNewSession({ getByRole, queryByRole })

    // Confirming created the session up front.
    const create = fetchMock.mock.calls.find(
      ([input, init]) =>
        requestUrl(input) === "/v1/sessions" &&
        (init as RequestInit | undefined)?.method === "POST",
    )
    expect(create).toBeDefined()

    // No prompt went out and no session_config frame was delivered: the
    // controls come from the create response alone.
    const socket = gatewaySocket()
    const sent = sentStreamMessages(socket)
    expect(sent.some((message) => message.type === "prompt")).toBe(false)

    expect(getByRole("button", { name: /Model: GPT-5\.2/ })).toBeInTheDocument()
    expect(getByRole("button", { name: /Mode: Agent\. Press for Ask\./ })).toBeInTheDocument()
    expect(
      getByRole("button", { name: /Thinking: Medium, level 2 of 3\. Press for High\./ }),
    ).toBeInTheDocument()
  }, 10_000)
})
