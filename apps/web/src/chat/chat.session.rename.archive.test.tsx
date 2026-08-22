import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"
import { SessionCollectionSchema } from "contracts/http/session"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
import { FakeSocket, installFakeWebSocket } from "../test/fake.websocket"
import { ChatPage } from "../shell/pages/ChatPage"
import { clearChatTestSelection, joinSessionByName } from "./select.combobox.option"

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
    },
  ],
})

const sessionsList = SessionCollectionSchema.parse({
  items: [
    {
      agentId: "cursor",
      sessionId: "sess_01JFC8C7E77NQCFH0RF9Z22JHH",
      cwd: "/home/operator/agent-server",
      title: "Explain auth",
      updatedAt: "2026-07-24T12:00:00.000Z",
    },
  ],
})

const originalFetch = globalThis.fetch

describe("Chat session rename and archive", () => {
  const sockets: FakeSocket[] = []
  const restoreWebSocket = { current: () => undefined }

  beforeEach(() => {
    clearChatTestSelection()
    sockets.length = 0
    restoreWebSocket.current = installFakeWebSocket(sockets)
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

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

  test("does not offer host rename or archive", async () => {
    const { getByRole, queryByRole } = renderWithProviders(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )

    await joinSessionByName({ getByRole }, "Explain auth")

    await waitFor(() => {
      expect(getByRole("button", { name: "Session" })).toHaveTextContent("Explain auth")
    })

    expect(queryByRole("textbox", { name: "Session" })).not.toBeInTheDocument()
    expect(queryByRole("combobox", { name: "Session" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "Edit name for Explain auth" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "Archive Explain auth" })).not.toBeInTheDocument()
  })
})
