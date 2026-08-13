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
import {
  clearChatTestSelection,
  joinSessionByName,
  openComboboxOptions,
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

const listedSession = {
  agentId: "cursor" as const,
  sessionId: "sess_01JFC8C7E77NQCFH0RF9Z22JHH",
  cwd: "/home/operator/agent-server",
  title: "Explain auth",
  updatedAt: "2026-07-24T12:00:00.000Z",
}

const originalFetch = globalThis.fetch

describe("Chat session delete", () => {
  const sockets: FakeSocket[] = []
  const restoreWebSocket = { current: () => undefined }
  const deletedUrls: string[] = []

  beforeEach(() => {
    clearChatTestSelection()
    sockets.length = 0
    deletedUrls.length = 0
    restoreWebSocket.current = installFakeWebSocket(sockets)
    let items = [listedSession]
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
        items = []
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

  test("confirm delete closes the ACP session and clears the picker", async () => {
    const user = userEvent.setup()
    const { getByRole, queryByRole } = renderWithProviders(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )

    await joinSessionByName({ getByRole }, listedSession.title)

    await waitFor(() => {
      expect(getByRole("combobox", { name: "Session" })).toHaveValue(listedSession.title)
    })

    await openComboboxOptions({ getByRole }, "Session")
    await user.click(getByRole("button", { name: `Delete ${listedSession.title}` }))
    await user.click(getByRole("button", { name: "Confirm" }))

    await waitFor(() => {
      expect(deletedUrls).toEqual([
        `/v1/sessions/${listedSession.sessionId}?agentId=cursor`,
      ])
    })

    await waitFor(() => {
      expect(queryByRole("option", { name: new RegExp(listedSession.title) })).not.toBeInTheDocument()
    })
  })
})
