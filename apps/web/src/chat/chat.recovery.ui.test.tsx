import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { SessionCollectionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { ChatPage } from "../shell/pages/ChatPage"

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

const originalFetch = globalThis.fetch
const originalWebSocket = globalThis.WebSocket

const renderChat = () =>
  renderWithProviders(
    <MemoryRouter>
      <ChatPage />
    </MemoryRouter>,
  )

const selectWorkspaceAndAgent = async (
  getByLabelText: ReturnType<typeof renderChat>["getByLabelText"],
) => {
  await waitFor(() => {
    expect(getByLabelText("Workspace")).not.toBeDisabled()
  })
  fireEvent.change(getByLabelText("Workspace"), { target: { value: "ws_01" } })
  fireEvent.change(getByLabelText("Agent"), { target: { value: "cursor" } })
}

const selectWorkspaceAgentAndWaitForSessions = async (
  getByLabelText: ReturnType<typeof renderChat>["getByLabelText"],
) => {
  await selectWorkspaceAndAgent(getByLabelText)
  await waitFor(() => {
    expect(getByLabelText("Session")).toHaveTextContent("Idle chat · idle")
  })
}

describe("Chat recovery UI", () => {
  beforeEach(() => {
    globalThis.WebSocket = function FakeWebSocket() {
      return {
        readyState: 1,
        close: () => undefined,
        send: () => undefined,
        addEventListener: () => undefined,
      }
    } as unknown as typeof WebSocket

    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
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
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  })

  test("new session keeps composer enabled with workspace and agent", async () => {
    const { getByLabelText, getByRole } = renderChat()
    await selectWorkspaceAgentAndWaitForSessions(getByLabelText)

    expect(getByLabelText("Session")).toHaveValue("")
    expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
  })

  test("idle session enables composer and shows online status dot", async () => {
    const { getByLabelText, getByRole } = renderChat()
    await selectWorkspaceAgentAndWaitForSessions(getByLabelText)

    fireEvent.change(getByLabelText("Session"), { target: { value: idleSession.id } })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveValue(idleSession.id)
    })

    expect(getByLabelText("Session")).toHaveTextContent("Idle chat · idle")
    expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
    expect(getByLabelText("online status")).toBeInTheDocument()
  })

  test("running session disables composer and shows cancel without blocked copy", async () => {
    const { getByLabelText, getByRole, queryByText } = renderChat()
    await selectWorkspaceAgentAndWaitForSessions(getByLabelText)

    fireEvent.change(getByLabelText("Session"), { target: { value: runningSession.id } })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveValue(runningSession.id)
    })

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
    await selectWorkspaceAgentAndWaitForSessions(getByLabelText)

    fireEvent.change(getByLabelText("Session"), { target: { value: offlineSession.id } })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveValue(offlineSession.id)
    })

    expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
    expect(
      getByText("Session reconnecting. Prompts unlock when it is idle again."),
    ).toBeInTheDocument()
    expect(getByLabelText("offline status")).toBeInTheDocument()
  })

  test("error session disables composer with terminal copy", async () => {
    const { getByLabelText, getByRole, getByText } = renderChat()
    await selectWorkspaceAgentAndWaitForSessions(getByLabelText)

    fireEvent.change(getByLabelText("Session"), { target: { value: errorSession.id } })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveValue(errorSession.id)
    })

    expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
    expect(
      getByText("Session ended with an error. Start a new session to continue."),
    ).toBeInTheDocument()
    expect(getByLabelText("offline status")).toBeInTheDocument()
  })

  test("console has no resume control", async () => {
    const { getByLabelText, queryByRole } = renderChat()
    await selectWorkspaceAgentAndWaitForSessions(getByLabelText)

    fireEvent.change(getByLabelText("Session"), { target: { value: offlineSession.id } })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveValue(offlineSession.id)
    })

    expect(queryByRole("button", { name: /resume/i })).not.toBeInTheDocument()
  })

  test("switching sessions does not post cancel", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>
    const { getByLabelText } = renderChat()
    await selectWorkspaceAgentAndWaitForSessions(getByLabelText)

    fireEvent.change(getByLabelText("Session"), { target: { value: runningSession.id } })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveValue(runningSession.id)
    })

    const cancelCallsBefore = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).includes("/cancel") && (init as RequestInit | undefined)?.method === "POST",
    ).length

    fireEvent.change(getByLabelText("Session"), { target: { value: idleSession.id } })

    await waitFor(() => {
      expect(getByLabelText("Session")).toHaveValue(idleSession.id)
    })

    const cancelCallsAfter = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).includes("/cancel") && (init as RequestInit | undefined)?.method === "POST",
    ).length

    expect(cancelCallsAfter).toBe(cancelCallsBefore)
  })
})
