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
    {
      id: "claude",
      displayName: "Claude",
      available: false,
      enabled: false,
      path: null,
    },
  ],
})

const emptySessions = SessionCollectionSchema.parse({
  items: [],
  page: { limit: 100, count: 0 },
})

const originalFetch = globalThis.fetch
const originalWebSocket = globalThis.WebSocket

const renderChatPage = () =>
  renderWithProviders(
    <MemoryRouter>
      <ChatPage />
    </MemoryRouter>,
  )

describe("ChatPage", () => {
  beforeEach(() => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = String(input)

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
          new Response(JSON.stringify(emptySessions), {
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

  test("renders page landmark and welcome copy", async () => {
    const { getByRole, getByText } = renderChatPage()

    expect(getByRole("main")).toBeInTheDocument()
    await waitFor(() => {
      expect(getByRole("heading", { level: 3, name: "Test your ACP connection" })).toBeInTheDocument()
    })
    expect(getByText("Send a prompt directly to an agent without leaving the console.")).toBeInTheDocument()
  })

  test("workspace agent and session selectors leave the disabled stub state", async () => {
    const { getByLabelText } = renderChatPage()

    await waitFor(() => {
      expect(getByLabelText("Workspace")).not.toBeDisabled()
    })

    expect(getByLabelText("Agent")).not.toBeDisabled()
    expect(getByLabelText("Session")).toBeDisabled()
    expect(getByLabelText("Workspace").querySelectorAll("option").length).toBeGreaterThan(1)
  })

  test("composer enables when workspace and agent are selected", async () => {
    const { getByLabelText, getByRole } = renderChatPage()

    await waitFor(() => {
      expect(getByLabelText("Workspace")).not.toBeDisabled()
    })

    fireEvent.change(getByLabelText("Workspace"), { target: { value: "ws_01" } })
    fireEvent.change(getByLabelText("Agent"), { target: { value: "cursor" } })

    await waitFor(() => {
      expect(getByRole("textbox", { name: "Chat message" })).not.toBeDisabled()
    })
    expect(getByRole("button", { name: "Send message" })).toBeDisabled()
    expect(getByLabelText("Session")).not.toBeDisabled()
    expect(getByLabelText("Session")).toHaveValue("")
  })

  test("prototype slash menu, prompt chips, and attach are gone", async () => {
    const { getByRole, queryByRole, queryByText } = renderChatPage()

    await waitFor(() => {
      expect(getByRole("heading", { level: 3, name: "Test your ACP connection" })).toBeInTheDocument()
    })

    expect(queryByRole("menu", { name: "Slash commands" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "Summarize this workspace" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "Add attachment" })).not.toBeInTheDocument()
    expect(queryByText("ACP v0.8")).not.toBeInTheDocument()
    expect(getByRole("textbox", { name: "Chat message" })).toHaveAttribute(
      "placeholder",
      "Ask the agent…",
    )
  })
})
