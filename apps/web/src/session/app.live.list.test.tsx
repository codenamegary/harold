import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { defaultAuthSummary } from "../test/agent.settings.fixtures"
import { waitFor } from "@testing-library/react"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { SessionCollectionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import {
  clearChatTestSelection,
  joinSessionByName,
  openSessionOptions,
} from "../chat/select.combobox.option"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
import { FakeSocket, installFakeWebSocket } from "../test/fake.websocket"
import { AppRoutes } from "../shell/AppRouter"

const validStatus = {
  version: "0.1.0",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-01-01T00:00:00.000Z",
  acp: {
    state: "ready",
    activeSessions: 0,
  },
} as const

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

const selectedSession = {
  agentId: "cursor" as const,
  sessionId: "sess_01SELECTED000000000000001",
  cwd: workspacePath,
  title: "Selected chat",
  updatedAt: "2026-07-24T12:00:00.000Z",
}

const otherSession = {
  agentId: "cursor" as const,
  sessionId: "sess_01OTHER00000000000000002",
  cwd: workspacePath,
  title: "Background chat",
  updatedAt: "2026-07-24T12:01:00.000Z",
}

const originalFetch = globalThis.fetch

describe("App live session list", () => {
  const sockets: FakeSocket[] = []
  const restoreWebSocket = { current: () => undefined }
  const sessionItems = { current: [selectedSession, otherSession] }

  beforeEach(() => {
    clearChatTestSelection()
    sockets.length = 0
    sessionItems.current = [selectedSession, otherSession]
    restoreWebSocket.current = installFakeWebSocket(sockets)
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url === "/v1/status" || url.startsWith("/v1/status?")) {
        return Promise.resolve(
          new Response(JSON.stringify(validStatus), {
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
          new Response(JSON.stringify(SessionCollectionSchema.parse({ items: sessionItems.current })), {
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

  test("opening the session picker refetches the catalog", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    const { getByRole, queryByRole } = renderWithProviders(<AppRoutes />, {
      initialEntries: ["/chat"],
    })

    await joinSessionByName({ getByRole }, selectedSession.title)

    const getsBeforeOpen = fetchMock.mock.calls.filter(
      ([input]) => requestUrl(input).startsWith("/v1/sessions"),
    ).length

    sessionItems.current = [selectedSession]
    await openSessionOptions({ getByRole })

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => requestUrl(input).startsWith("/v1/sessions"))
          .length,
      ).toBeGreaterThan(getsBeforeOpen)
    })

    await waitFor(() => {
      expect(queryByRole("option", { name: new RegExp(otherSession.title) })).not.toBeInTheDocument()
    })
    expect(getByRole("option", { name: new RegExp(selectedSession.title) })).toBeInTheDocument()
  })

  test("window focus refetches the catalog", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    renderWithProviders(<AppRoutes />, {
      initialEntries: ["/chat"],
    })

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => requestUrl(input).startsWith("/v1/sessions")),
      ).toBe(true)
    })

    const getsBeforeFocus = fetchMock.mock.calls.filter(
      ([input]) => requestUrl(input).startsWith("/v1/sessions"),
    ).length

    window.dispatchEvent(new Event("focus"))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => requestUrl(input).startsWith("/v1/sessions"))
          .length,
      ).toBeGreaterThan(getsBeforeFocus)
    })
  })

  test("switching selected session keeps one gateway stream", async () => {
    const { getByRole } = renderWithProviders(<AppRoutes />, {
      initialEntries: ["/chat"],
    })

    await joinSessionByName({ getByRole }, selectedSession.title)
    const gatewayBefore = sockets.filter((socket) => socket.url.includes("/v1/sessions/stream"))
    expect(gatewayBefore.length).toBe(1)

    await joinSessionByName({ getByRole }, otherSession.title)

    expect(sockets.filter((socket) => socket.url.includes("/v1/sessions/stream"))).toHaveLength(1)
    expect(getByRole("button", { name: "Session" })).toHaveTextContent(otherSession.title)
  })
})
