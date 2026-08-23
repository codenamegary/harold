import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { defaultAuthSummary } from "../test/agent.settings.fixtures"
import { waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { SessionCollectionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
import { FakeSocket, installFakeWebSocket } from "../test/fake.websocket"
import { AppRoutes } from "../shell/AppRouter"
import {
  clearChatTestSelection,
  openSessionOptions,
} from "../chat/select.combobox.option"
import { readChatSelection } from "../chat/chat.selection.storage"

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

const olderSession = {
  agentId: "cursor" as const,
  sessionId: "sess_old",
  cwd: "/home/operator/agent-server",
  title: "Older session",
  updatedAt: "2026-07-20T12:00:00.000Z",
}

const listedSession = {
  agentId: "cursor" as const,
  sessionId: "sess_01JFC8C7E77NQCFH0RF9Z22JHH",
  cwd: "/home/operator/agent-server",
  title: "Explain auth",
  updatedAt: "2026-07-24T12:00:00.000Z",
}

const originalFetch = globalThis.fetch

describe("Sessions page and hybrid picker", () => {
  const deletedUrls: string[] = []
  const sockets: FakeSocket[] = []
  const restoreWebSocket = { current: () => undefined }

  beforeEach(() => {
    clearChatTestSelection()
    deletedUrls.length = 0
    sockets.length = 0
    restoreWebSocket.current = installFakeWebSocket(sockets)
    let items = [listedSession, olderSession]
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

      if (method === "DELETE" && url.startsWith("/v1/sessions/")) {
        deletedUrls.push(url)
        const sessionId = decodeURIComponent(
          url.slice("/v1/sessions/".length).split("?")[0] ?? "",
        )
        items = items.filter((item) => item.sessionId !== sessionId)
        return Promise.resolve(new Response(null, { status: 204 }))
      }

      if (url.startsWith("/v1/sessions")) {
        return Promise.resolve(
          new Response(JSON.stringify(SessionCollectionSchema.parse({ items })), {
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

  test("chat header All sessions opens sessions page without delete in menu", async () => {
    const user = userEvent.setup()
    const { getByRole, queryByRole } = renderWithProviders(
      <MemoryRouter initialEntries={["/chat"]}>
        <AppRoutes />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(getByRole("button", { name: "Session" })).toBeEnabled()
    })

    await openSessionOptions({ getByRole })
    expect(getByRole("option", { name: /Explain auth/ })).toBeInTheDocument()
    expect(getByRole("option", { name: /Older session/ })).toBeInTheDocument()
    expect(queryByRole("option", { name: /See all sessions/ })).not.toBeInTheDocument()
    expect(queryByRole("option", { name: /All sessions/ })).not.toBeInTheDocument()
    expect(queryByRole("option", { name: /New session/ })).not.toBeInTheDocument()
    expect(
      queryByRole("button", { name: `Delete ${listedSession.title}` }),
    ).not.toBeInTheDocument()
    await user.keyboard("{Escape}")

    await user.click(getByRole("button", { name: "All sessions" }))
    await waitFor(() => {
      expect(getByRole("button", { name: "New session" })).toBeInTheDocument()
      expect(getByRole("table", { name: "Sessions" })).toBeInTheDocument()
    })
  })

  test("sessions page bulk delete", async () => {
    const user = userEvent.setup()
    const { getByRole, queryByRole, getByText } = renderWithProviders(
      <MemoryRouter initialEntries={["/sessions"]}>
        <AppRoutes />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(getByRole("table", { name: "Sessions" })).toBeInTheDocument()
    })

    await user.click(getByRole("checkbox", { name: "Select Explain auth" }))
    await user.click(getByRole("checkbox", { name: "Select Older session" }))
    await user.click(getByRole("button", { name: "Delete selected (2)" }))
    await user.click(getByRole("button", { name: "Confirm delete 2" }))

    await waitFor(() => {
      expect(deletedUrls).toHaveLength(2)
      expect(deletedUrls).toContain(
        `/v1/sessions/${encodeURIComponent(listedSession.sessionId)}?agentId=cursor`,
      )
      expect(deletedUrls).toContain(
        `/v1/sessions/${encodeURIComponent(olderSession.sessionId)}?agentId=cursor`,
      )
    })

    await waitFor(() => {
      expect(queryByRole("row", { name: /Explain auth/ })).not.toBeInTheDocument()
      expect(getByText("No sessions match.")).toBeInTheDocument()
    })
  })

  test("sessions page bulk delete keeps confirm mode on partial failure", async () => {
    const user = userEvent.setup()
    let items = [listedSession, olderSession]
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

      if (method === "DELETE" && url.includes(listedSession.sessionId)) {
        deletedUrls.push(url)
        items = items.filter((item) => item.sessionId !== listedSession.sessionId)
        return Promise.resolve(new Response(null, { status: 204 }))
      }

      if (method === "DELETE" && url.includes(olderSession.sessionId)) {
        deletedUrls.push(url)
        return Promise.resolve(
          new Response(
            JSON.stringify({
              type: "https://agent-server.local/problems/conflict",
              title: "Conflict",
              status: 409,
              detail: "Agent is unavailable",
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/problem+json" },
            },
          ),
        )
      }

      if (url.startsWith("/v1/sessions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(SessionCollectionSchema.parse({ items })),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const { getByRole, getByText } = renderWithProviders(
      <MemoryRouter initialEntries={["/sessions"]}>
        <AppRoutes />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(getByRole("table", { name: "Sessions" })).toBeInTheDocument()
    })

    await user.click(getByRole("checkbox", { name: "Select Explain auth" }))
    await user.click(getByRole("checkbox", { name: "Select Older session" }))
    await user.click(getByRole("button", { name: "Delete selected (2)" }))
    await user.click(getByRole("button", { name: "Confirm delete 2" }))

    await waitFor(() => {
      expect(getByText("Failed to delete 1 session.")).toBeInTheDocument()
      expect(getByRole("button", { name: "Confirm delete 1" })).toBeInTheDocument()
    })
  })

  test("sessions page cancel stops remaining deletes", async () => {
    const user = userEvent.setup()
    let items = [listedSession, olderSession]
    const releaseFirstDelete = {
      resolve: () => undefined as void,
    }
    const firstDeleteGate = new Promise<void>((resolve) => {
      releaseFirstDelete.resolve = resolve
    })
    let firstDeleteStarted = false

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

      if (method === "DELETE" && url.startsWith("/v1/sessions/")) {
        deletedUrls.push(url)
        const sessionId = decodeURIComponent(
          url.slice("/v1/sessions/".length).split("?")[0] ?? "",
        )

        if (!firstDeleteStarted) {
          firstDeleteStarted = true
          return firstDeleteGate.then(() => {
            if (init?.signal?.aborted) {
              const error = new Error("The operation was aborted.")
              error.name = "AbortError"
              throw error
            }
            items = items.filter((item) => item.sessionId !== sessionId)
            return new Response(null, { status: 204 })
          })
        }

        items = items.filter((item) => item.sessionId !== sessionId)
        return Promise.resolve(new Response(null, { status: 204 }))
      }

      if (url.startsWith("/v1/sessions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(SessionCollectionSchema.parse({ items })),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const { getByRole, queryByRole } = renderWithProviders(
      <MemoryRouter initialEntries={["/sessions"]}>
        <AppRoutes />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(getByRole("table", { name: "Sessions" })).toBeInTheDocument()
    })

    await user.click(getByRole("checkbox", { name: "Select Explain auth" }))
    await user.click(getByRole("checkbox", { name: "Select Older session" }))
    await user.click(getByRole("button", { name: "Delete selected (2)" }))
    await user.click(getByRole("button", { name: "Confirm delete 2" }))

    await waitFor(() => {
      expect(getByRole("button", { name: "Cancel" })).toBeEnabled()
      expect(deletedUrls).toHaveLength(1)
    })

    await user.click(getByRole("button", { name: "Cancel" }))
    releaseFirstDelete.resolve()

    await waitFor(() => {
      expect(getByRole("button", { name: "Delete selected (2)" })).toBeInTheDocument()
    })

    expect(deletedUrls).toHaveLength(1)
    expect(queryByRole("button", { name: /Confirm delete/ })).not.toBeInTheDocument()
  })

  test("row click joins session and opens chat", async () => {
    const user = userEvent.setup()
    const { getByRole } = renderWithProviders(
      <MemoryRouter initialEntries={["/sessions"]}>
        <AppRoutes />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(getByRole("button", { name: "Open Explain auth" })).toBeInTheDocument()
    })

    await user.click(getByRole("button", { name: "Open Explain auth" }))
    await waitFor(() => {
      expect(getByRole("button", { name: "Session" })).toHaveTextContent(
        listedSession.title,
      )
    })
    expect(readChatSelection()?.sessionId).toBe(listedSession.sessionId)
  })
})
