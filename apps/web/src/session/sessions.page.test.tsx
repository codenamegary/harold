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
      sessionListSupported: true,
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
  const deletedBodies: unknown[] = []
  const sockets: FakeSocket[] = []
  const restoreWebSocket = { current: () => undefined }

  beforeEach(() => {
    clearChatTestSelection()
    deletedBodies.length = 0
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

      if (method === "DELETE" && url === "/v1/sessions") {
        const rawBody =
          typeof init?.body === "string"
            ? init.body
            : JSON.stringify(init?.body ?? {})
        const body = JSON.parse(rawBody) as {
          items: Array<{ agentId: string; sessionId: string }>
        }
        deletedBodies.push(body)
        const deletedIds = new Set(body.items.map((item) => item.sessionId))
        items = items.filter((item) => !deletedIds.has(item.sessionId))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              deleted: body.items,
              failed: [],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
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

  test("chat menu shows recent sessions and See all without delete", async () => {
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
    expect(getByRole("option", { name: /New session/ })).toBeInTheDocument()
    expect(getByRole("option", { name: /Explain auth/ })).toBeInTheDocument()
    expect(getByRole("option", { name: /Older session/ })).toBeInTheDocument()
    expect(getByRole("option", { name: /See all sessions/ })).toBeInTheDocument()
    expect(
      queryByRole("button", { name: `Delete ${listedSession.title}` }),
    ).not.toBeInTheDocument()

    await user.click(getByRole("option", { name: /See all sessions/ }))
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
      expect(deletedBodies).toEqual([
        {
          items: [
            {
              agentId: "cursor",
              sessionId: listedSession.sessionId,
            },
            {
              agentId: "cursor",
              sessionId: olderSession.sessionId,
            },
          ],
        },
      ])
    })

    await waitFor(() => {
      expect(queryByRole("row", { name: /Explain auth/ })).not.toBeInTheDocument()
      expect(getByText("No sessions match.")).toBeInTheDocument()
    })
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
