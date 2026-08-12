import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { Event } from "contracts/events/event"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { SessionCollectionSchema, SessionSchema, SessionState } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { hrefOf, requestUrl } from "../test/request.url"
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
      sessionListSupported: true,
    },
  ],
})

const workspacePath = "/home/operator/agent-server"

const idleLegacy = SessionSchema.parse({
  id: "sess_01IDLE00000000000000001",
  workspaceId: "ws_01",
  agentId: "cursor",
  name: "Idle chat",
  state: "idle",
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:00:00.000Z",
  archivedAt: null,
})

const runningLegacy = SessionSchema.parse({
  id: "sess_01RUNNING00000000000002",
  workspaceId: "ws_01",
  agentId: "cursor",
  name: "Running chat",
  state: "running",
  createdAt: "2026-07-24T12:01:00.000Z",
  lastUsedAt: "2026-07-24T12:01:00.000Z",
  archivedAt: null,
})

const offlineLegacy = SessionSchema.parse({
  id: "sess_01OFFLINE00000000000003",
  workspaceId: "ws_01",
  agentId: "cursor",
  name: "Offline chat",
  state: "offline",
  createdAt: "2026-07-24T12:02:00.000Z",
  lastUsedAt: "2026-07-24T12:02:00.000Z",
  archivedAt: null,
})

const errorLegacy = SessionSchema.parse({
  id: "sess_01ERROR0000000000000004",
  workspaceId: "ws_01",
  agentId: "cursor",
  name: "Error chat",
  state: "error",
  createdAt: "2026-07-24T12:03:00.000Z",
  lastUsedAt: "2026-07-24T12:03:00.000Z",
  archivedAt: null,
})

const legacyBySessionId: Record<string, typeof idleLegacy> = {
  [idleLegacy.id]: idleLegacy,
  [runningLegacy.id]: runningLegacy,
  [offlineLegacy.id]: offlineLegacy,
  [errorLegacy.id]: errorLegacy,
}

const idleSession = {
  agentId: idleLegacy.agentId,
  sessionId: idleLegacy.id,
  cwd: workspacePath,
  title: idleLegacy.name,
  updatedAt: idleLegacy.lastUsedAt,
}

const runningSession = {
  agentId: runningLegacy.agentId,
  sessionId: runningLegacy.id,
  cwd: workspacePath,
  title: runningLegacy.name,
  updatedAt: runningLegacy.lastUsedAt,
}

const offlineSession = {
  agentId: offlineLegacy.agentId,
  sessionId: offlineLegacy.id,
  cwd: workspacePath,
  title: offlineLegacy.name,
  updatedAt: offlineLegacy.lastUsedAt,
}

const errorSession = {
  agentId: errorLegacy.agentId,
  sessionId: errorLegacy.id,
  cwd: workspacePath,
  title: errorLegacy.name,
  updatedAt: errorLegacy.lastUsedAt,
}

const sessionsList = SessionCollectionSchema.parse({
  items: [idleSession, runningSession, offlineSession, errorSession],
})

const idleSessionLabel = "Idle chat"
const runningSessionLabel = "Running chat"
const offlineSessionLabel = "Offline chat"
const errorSessionLabel = "Error chat"

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

const isSessionEventSocket = (socket: FakeSocket, sessionId: string) =>
  socket.url.includes("/v1/events") && socket.url.includes(`sessionId=${sessionId}`)

const sessionStateEvent = (params: {
  sessionId: string
  state: SessionState
}): Event => ({
  type: "session.state",
  cursor: "1",
  occurredAt: "2026-07-24T12:00:00.000Z",
  workspaceId: "ws_01",
  sessionId: params.sessionId,
  payload: {
    sessionId: params.sessionId,
    state: params.state,
  },
})

const dispatchSessionState = async (
  sockets: FakeSocket[],
  sessionId: string,
  state: SessionState,
) => {
  await waitFor(() => {
    expect(sockets.some((socket) => isSessionEventSocket(socket, sessionId))).toBe(true)
  })

  const socket = sockets.find((candidate) => isSessionEventSocket(candidate, sessionId))
  act(() => {
    socket?.dispatch("message", JSON.stringify([sessionStateEvent({ sessionId, state })]))
  })
}

const renderChat = () =>
  renderWithProviders(
    <MemoryRouter>
      <ChatPage />
    </MemoryRouter>,
  )

describe("Chat recovery UI", () => {
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

      if (url.includes("/select") && method === "POST") {
        const sessionId = url.split("/sessions/")[1]?.split("/")[0] ?? ""
        const legacySession = legacyBySessionId[sessionId] ?? idleLegacy
        return Promise.resolve(
          new Response(JSON.stringify(legacySession), {
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
    await dispatchSessionState(sockets, idleSession.sessionId, "idle")

    expect(getByRole("combobox", { name: "Session" })).toHaveValue(idleSessionLabel)
    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
    })
    expect(getByLabelText("online status")).toBeInTheDocument()
  })

  test("running session disables composer and shows cancel without blocked copy", async () => {
    const { getByLabelText, getByRole, queryByText } = renderChat()
    await joinSessionByName({ getByRole }, runningSessionLabel)
    await dispatchSessionState(sockets, runningSession.sessionId, "running")

    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
    })
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
    await dispatchSessionState(sockets, offlineSession.sessionId, "offline")

    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
    })
    expect(
      getByText("Session reconnecting. Prompts unlock when it is idle again."),
    ).toBeInTheDocument()
    expect(getByLabelText("offline status")).toBeInTheDocument()
  })

  test("error session disables composer with terminal copy", async () => {
    const { getByLabelText, getByRole, getByText } = renderChat()
    await joinSessionByName({ getByRole }, errorSessionLabel)
    await dispatchSessionState(sockets, errorSession.sessionId, "error")

    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
    })
    expect(
      getByText("Session ended with an error. Start a new session to continue."),
    ).toBeInTheDocument()
    expect(getByLabelText("offline status")).toBeInTheDocument()
  })

  test("console has no resume control", async () => {
    const { getByRole, queryByRole } = renderChat()
    await joinSessionByName({ getByRole }, offlineSessionLabel)
    await dispatchSessionState(sockets, offlineSession.sessionId, "offline")

    expect(queryByRole("button", { name: /resume/i })).not.toBeInTheDocument()
  })

  test("switching sessions does not post cancel", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    const { getByRole } = renderChat()
    await joinSessionByName({ getByRole }, runningSessionLabel)
    await dispatchSessionState(sockets, runningSession.sessionId, "running")

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
