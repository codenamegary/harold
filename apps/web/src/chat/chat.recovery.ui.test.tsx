import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { MemoryRouter } from "react-router"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { SessionCollectionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
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
      present: true,
      popular: true,
    },
  ],
})

const idleSession = {
  id: "sess_01IDLE00000000000000001",
  workspaceId: "ws_01",
  agentId: "cursor" as const,
  name: "Idle chat",
  state: "idle" as const,
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:00:00.000Z",
  archivedAt: null,
}

const runningSession = {
  id: "sess_01RUNNING00000000000002",
  workspaceId: "ws_01",
  agentId: "cursor" as const,
  name: "Running chat",
  state: "running" as const,
  createdAt: "2026-07-24T12:01:00.000Z",
  lastUsedAt: "2026-07-24T12:01:00.000Z",
  archivedAt: null,
}

const offlineSession = {
  id: "sess_01OFFLINE00000000000003",
  workspaceId: "ws_01",
  agentId: "cursor" as const,
  name: "Offline chat",
  state: "offline" as const,
  createdAt: "2026-07-24T12:02:00.000Z",
  lastUsedAt: "2026-07-24T12:02:00.000Z",
  archivedAt: null,
}

const errorSession = {
  id: "sess_01ERROR0000000000000004",
  workspaceId: "ws_01",
  agentId: "cursor" as const,
  name: "Error chat",
  state: "error" as const,
  createdAt: "2026-07-24T12:03:00.000Z",
  lastUsedAt: "2026-07-24T12:03:00.000Z",
  archivedAt: null,
}

const sessionsList = SessionCollectionSchema.parse({
  items: [idleSession, runningSession, offlineSession, errorSession],
  page: { limit: 100, count: 4 },
})

const idleSessionLabel = "Idle chat"
const runningSessionLabel = "Running chat"
const offlineSessionLabel = "Offline chat"
const errorSessionLabel = "Error chat"

const originalFetch = globalThis.fetch
const originalWebSocket = globalThis.WebSocket

const renderChat = () =>
  renderWithProviders(
    <MemoryRouter>
      <ChatPage />
    </MemoryRouter>,
  )

describe("Chat recovery UI", () => {
  beforeEach(() => {
    clearChatTestSelection()
    globalThis.WebSocket = function FakeWebSocket() {
      return {
        readyState: 1,
        close: () => undefined,
        send: () => undefined,
        addEventListener: () => undefined,
      }
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

      if (url.includes("/select") && method === "POST") {
        const sessionId = url.split("/sessions/")[1]?.split("/")[0] ?? ""
        const session = sessionsList.items.find((item) => item.id === sessionId)
        return Promise.resolve(
          new Response(JSON.stringify(session ?? idleSession), {
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

  test("new session keeps composer enabled with workspace and agent", async () => {
    const { getByRole } = renderChat()
    await startNewSession({ getByRole })

    expect(getByRole("combobox", { name: "Session" })).toHaveValue("New session")
    expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
  })

  test("idle session enables composer and shows online status dot", async () => {
    const { getByLabelText, getByRole } = renderChat()
    await joinSessionByName({ getByRole }, idleSessionLabel)

    expect(getByRole("combobox", { name: "Session" })).toHaveValue(idleSessionLabel)
    expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
    expect(getByLabelText("online status")).toBeInTheDocument()
  })

  test("running session disables composer and shows cancel without blocked copy", async () => {
    const { getByLabelText, getByRole, queryByText } = renderChat()
    await joinSessionByName({ getByRole }, runningSessionLabel)

    expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
    expect(getByRole("button", { name: "Cancel turn" })).toBeInTheDocument()
    expect(
      queryByText("Session reconnecting. Prompts unlock when it is idle again."),
    ).not.toBeInTheDocument()
    expect(
      queryByText("Session ended with an error. Start a new session to continue."),
    ).not.toBeInTheDocument()
    expect(getByLabelText("warning status")).toBeInTheDocument()
  })

  test("offline session disables composer with reconnect copy", async () => {
    const { getByLabelText, getByRole, getByText } = renderChat()
    await joinSessionByName({ getByRole }, offlineSessionLabel)

    expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
    expect(
      getByText("Session reconnecting. Prompts unlock when it is idle again."),
    ).toBeInTheDocument()
    expect(getByLabelText("offline status")).toBeInTheDocument()
  })

  test("error session disables composer with terminal copy", async () => {
    const { getByLabelText, getByRole, getByText } = renderChat()
    await joinSessionByName({ getByRole }, errorSessionLabel)

    expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
    expect(
      getByText("Session ended with an error. Start a new session to continue."),
    ).toBeInTheDocument()
    expect(getByLabelText("offline status")).toBeInTheDocument()
  })

  test("console has no resume control", async () => {
    const { getByRole, queryByRole } = renderChat()
    await joinSessionByName({ getByRole }, offlineSessionLabel)

    expect(queryByRole("button", { name: /resume/i })).not.toBeInTheDocument()
  })

  test("switching sessions does not post cancel", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    const { getByRole } = renderChat()
    await joinSessionByName({ getByRole }, runningSessionLabel)

    const cancelCallsBefore = fetchMock.mock.calls.filter(
      ([input, init]) =>
        requestUrl(input).includes("/cancel") && (init as RequestInit | undefined)?.method === "POST",
    ).length

    await joinSessionByName({ getByRole }, idleSessionLabel)

    const cancelCallsAfter = fetchMock.mock.calls.filter(
      ([input, init]) =>
        requestUrl(input).includes("/cancel") && (init as RequestInit | undefined)?.method === "POST",
    ).length

    expect(cancelCallsAfter).toBe(cancelCallsBefore)
  })
})
