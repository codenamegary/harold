import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, fireEvent, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { SessionCollectionSchema, SessionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { hrefOf, requestUrl } from "../test/request.url"
import { ChatPage } from "../shell/pages/ChatPage"
import {
  clearChatTestSelection,
  joinSessionByName,
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
    },
  ],
})

const liveSession = SessionSchema.parse({
  id: "sess_01JFC8C7E77NQCFH0RF9Z22JHH",
  workspaceId: "ws_01",
  agentId: "cursor",
  name: "Explain auth",
  state: "idle",
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:00:00.000Z",
  archivedAt: null,
})

const sessionsList = SessionCollectionSchema.parse({
  items: [liveSession],
  page: { limit: 100, count: 1 },
})

type FakeSocket = {
  url: string
  readyState: number
  close: () => void
  send: (data: string) => void
  addEventListener: (type: string, listener: (event: { data?: string }) => void) => void
}

const originalFetch = globalThis.fetch
const originalWebSocket = globalThis.WebSocket

const createFakeSocket = (url: string): FakeSocket => {
  const listeners = new Map<string, Array<(event: { data?: string }) => void>>()

  return {
    url,
    readyState: 1,
    close: () => undefined,
    send: () => undefined,
    addEventListener: (type, listener) => {
      const current = listeners.get(type) ?? []
      listeners.set(type, [...current, listener])
    },
  }
}

const renderChatPage = () =>
  renderWithProviders(
    <MemoryRouter>
      <ChatPage />
    </MemoryRouter>,
  )

const selectLiveSession = async (getByRole: ReturnType<typeof renderChatPage>["getByRole"]) => {
  await joinSessionByName({ getByRole }, "Explain auth")
}

describe("Chat session rename and archive", () => {
  beforeEach(() => {
    clearChatTestSelection()
    globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
      return createFakeSocket(hrefOf(url))
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

      if (url.startsWith(`/v1/sessions/${liveSession.id}/select`) && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(liveSession), {
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

  test("renames a session and updates the list and header", async () => {
    const renamed = SessionSchema.parse({
      ...liveSession,
      name: "Renamed session",
      lastUsedAt: "2026-07-24T12:10:00.000Z",
    })

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === `/v1/sessions/${liveSession.id}` && method === "PATCH") {
        return Promise.resolve(
          new Response(JSON.stringify(renamed), {
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

      if (url.startsWith(`/v1/sessions/${liveSession.id}/select`) && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(liveSession), {
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
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole } = renderChatPage()
    await selectLiveSession(getByRole)

    await waitFor(() => {
      expect(getByRole("button", { name: "Edit name for Explain auth" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Edit name for Explain auth" }))
    await waitFor(() => {
      expect(getByRole("button", { name: "Rename Explain auth" })).toBeInTheDocument()
    })
    fireEvent.click(getByRole("button", { name: "Rename Explain auth" }))
    const renameInput = getByRole("textbox", { name: "Rename Explain auth" })
    fireEvent.change(renameInput, { target: { value: "Renamed session" } })
    fireEvent.submit(renameInput.closest("form")!)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/v1/sessions/${liveSession.id}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Renamed session" }),
        }),
      )
    })

    await waitFor(() => {
      expect(getByRole("button", { name: "Edit name for Renamed session" })).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(getByRole("combobox", { name: "Session" })).toHaveValue("Renamed session")
    })
  })

  test("shows rename Problem Details in the header", async () => {
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === `/v1/sessions/${liveSession.id}` && method === "PATCH") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              type: "https://agent-server.local/problems/not-found",
              title: "Session not found",
              detail: "Unknown session id.",
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          ),
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

      if (url.startsWith(`/v1/sessions/${liveSession.id}/select`) && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(liveSession), {
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
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole } = renderChatPage()
    await selectLiveSession(getByRole)

    await waitFor(() => {
      expect(getByRole("button", { name: "Edit name for Explain auth" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Edit name for Explain auth" }))
    await waitFor(() => {
      expect(getByRole("button", { name: "Rename Explain auth" })).toBeInTheDocument()
    })
    fireEvent.click(getByRole("button", { name: "Rename Explain auth" }))
    const renameInput = getByRole("textbox", { name: "Rename Explain auth" })
    fireEvent.change(renameInput, { target: { value: "Missing session" } })
    fireEvent.submit(renameInput.closest("form")!)

    await waitFor(() => {
      expect(getByRole("alert")).toHaveTextContent("Unknown session id.")
    })
  })

  test("archives a session and removes it from the live list", async () => {
    const archived = SessionSchema.parse({
      ...liveSession,
      state: "archived",
      archivedAt: "2026-07-24T12:20:00.000Z",
    })
    const emptyAfterArchive = SessionCollectionSchema.parse({
      items: [],
      page: { limit: 100, count: 0 },
    })
    const archivedFlag = { value: false }

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === `/v1/sessions/${liveSession.id}/archive` && method === "POST") {
        archivedFlag.value = true
        return Promise.resolve(
          new Response(JSON.stringify(archived), {
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

      if (url.startsWith(`/v1/sessions/${liveSession.id}/select`) && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(liveSession), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/sessions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(archivedFlag.value ? emptyAfterArchive : sessionsList),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole, queryByRole } = renderChatPage()
    await selectLiveSession(getByRole)

    await waitFor(() => {
      expect(getByRole("button", { name: "Archive Explain auth" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Archive Explain auth" }))
    const dialog = getByRole("dialog")
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Archive" }))
    })

    await waitFor(() => {
      expect(queryByRole("dialog")).not.toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `/v1/sessions/${liveSession.id}/archive`,
      expect.objectContaining({
        method: "POST",
      }),
    )

    await waitFor(() => {
      expect(getByRole("combobox", { name: "Session" })).toHaveValue("New session")
      expect(queryByRole("button", { name: "Rename Explain auth" })).not.toBeInTheDocument()
    })
  })

  test("shows archive Problem Details in the modal", async () => {
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = init?.method ?? "GET"

      if (url === `/v1/sessions/${liveSession.id}/archive` && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              type: "https://agent-server.local/problems/conflict",
              title: "Session is archived",
              detail: "Session is already archived.",
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json" },
            },
          ),
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

      if (url.startsWith(`/v1/sessions/${liveSession.id}/select`) && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(liveSession), {
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
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole } = renderChatPage()
    await selectLiveSession(getByRole)

    await waitFor(() => {
      expect(getByRole("button", { name: "Archive Explain auth" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Archive Explain auth" }))
    fireEvent.click(getByRole("button", { name: "Archive" }))

    await waitFor(() => {
      expect(getByRole("dialog")).toHaveTextContent("Session is already archived.")
    })
  })
})
