import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, waitFor, within } from "@testing-library/react"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { createStore } from "jotai"
import { nowAtom } from "../connection/nowAtom"
import { queryKeys } from "../query/queryKeys"
import { renderWithProviders } from "../query/renderWithProviders"
import { OverviewPage } from "../shell/pages/OverviewPage"

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

const validWorkspace = {
  id: "ws-agent-server",
  name: "agent-server",
  path: "/home/operator/agent-server",
  state: "available",
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:08:00.000Z",
} as const

const overviewWorkspaceCollection = WorkspaceCollectionSchema.parse({
  items: [validWorkspace],
  page: { limit: 4, count: 1 },
})

const emptyWorkspaceCollection = WorkspaceCollectionSchema.parse({
  items: [],
  page: { limit: 4, count: 0 },
})

const originalFetch = globalThis.fetch

const createOverviewStore = (now: number) => {
  const store = createStore()
  store.set(nowAtom, now)
  return store
}

const renderOverviewPage = (now = new Date("2026-01-01T01:01:01.000Z").getTime()) =>
  renderWithProviders(<OverviewPage />, {
    initialEntries: ["/"],
    jotaiStore: createOverviewStore(now),
  })

describe("OverviewPage", () => {
  beforeEach(() => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(emptyWorkspaceCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(
        new Response(JSON.stringify(validStatus), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("shows operational hero copy when server is online", async () => {
    const { getByRole } = renderOverviewPage()

    await waitFor(() => {
      expect(getByRole("heading", { level: 2, name: "Everything is operational." })).toBeInTheDocument()
    })

    expect(
      getByRole("main").textContent,
    ).toContain("Your local ACP server is accepting connections and agents are ready.")
  })

  test("shows checking hero copy while connection is loading", () => {
    globalThis.fetch = mock(() => new Promise(() => {})) as typeof fetch

    const { getByRole } = renderOverviewPage()

    expect(getByRole("heading", { level: 2, name: "Checking server status." })).toBeInTheDocument()
  })

  test("shows unreachable hero copy when server is down", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("network error"))) as typeof fetch

    const { getByRole } = renderOverviewPage()

    await waitFor(() => {
      expect(getByRole("heading", { level: 2, name: "Server unreachable." })).toBeInTheDocument()
    })
  })

  test("server status card shows live state and uptime when online", async () => {
    const { getByRole } = renderOverviewPage()

    await waitFor(() => {
      expect(getByRole("article", { name: "Server status" })).toHaveTextContent("Online")
    })

    const serverCard = getByRole("article", { name: "Server status" })

    expect(within(serverCard).getByText("Healthy")).toBeInTheDocument()
    expect(within(serverCard).getByText("1h 1m")).toBeInTheDocument()
  })

  test("server status uptime updates when now advances", async () => {
    const startedAtMs = new Date(validStatus.startedAt).getTime()
    const store = createOverviewStore(startedAtMs + 3_600_000)
    const { getByRole, queryClient } = renderWithProviders(<OverviewPage />, {
      initialEntries: ["/"],
      jotaiStore: store,
    })

    queryClient.setQueryData(queryKeys.status, validStatus)

    await waitFor(() => {
      expect(within(getByRole("article", { name: "Server status" })).getByText("1h 0m")).toBeInTheDocument()
    })

    act(() => {
      store.set(nowAtom, startedAtMs + 3_661_000)
    })

    await waitFor(() => {
      expect(within(getByRole("article", { name: "Server status" })).getByText("1h 1m")).toBeInTheDocument()
    })
  })

  test("coming soon metric cards show muted copy without fake numbers", async () => {
    const { getByRole } = renderOverviewPage()

    await waitFor(() => {
      expect(getByRole("article", { name: "Server status" })).toHaveTextContent("Online")
    })

    const comingSoonCards = ["ACP runtime", "Active now", "Requests today"] as const

    comingSoonCards.forEach((cardName) => {
      const card = getByRole("article", { name: cardName })

      expect(within(card).getByText("Coming soon")).toBeInTheDocument()
      expect(within(card).queryByText(/\d/)).not.toBeInTheDocument()
    })
  })

  test("workspace panel shows empty state", async () => {
    const { getByRole } = renderOverviewPage()

    await waitFor(() => {
      expect(getByRole("region", { name: "Workspaces" })).toHaveTextContent(
        "No workspaces registered yet.",
      )
    })
  })

  test("workspace panel shows loaded workspaces", async () => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = String(input)

      if (url === "/v1/workspaces?limit=4") {
        return Promise.resolve(
          new Response(JSON.stringify(overviewWorkspaceCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(
        new Response(JSON.stringify(validStatus), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    }) as typeof fetch

    const { getByRole } = renderOverviewPage(new Date("2026-07-24T12:10:00.000Z").getTime())

    await waitFor(() => {
      expect(getByRole("region", { name: "Workspaces" })).toHaveTextContent("agent-server")
    })

    const workspacePanel = getByRole("region", { name: "Workspaces" })

    expect(within(workspacePanel).getByText("/home/operator/agent-server")).toBeInTheDocument()
    expect(within(workspacePanel).getByText("Available")).toBeInTheDocument()
    expect(within(workspacePanel).getByText("2m ago")).toBeInTheDocument()
    expect(within(workspacePanel).getByText("Coming soon")).toBeInTheDocument()
    expect(within(workspacePanel).getByText("Agents not live")).toBeInTheDocument()
  })

  test("activity panel shows empty state without live tag", async () => {
    const { getByRole, queryByText } = renderOverviewPage()

    await waitFor(() => {
      expect(getByRole("region", { name: "Recent activity" })).toHaveTextContent(
        "No recent activity.",
      )
    })

    expect(queryByText("LIVE")).not.toBeInTheDocument()
  })

  test("hero and banner actions link to shell routes", async () => {
    const { getByRole } = renderOverviewPage()

    await waitFor(() => {
      expect(getByRole("link", { name: "Configure access" })).toHaveAttribute("href", "/connect")
    })

    expect(getByRole("link", { name: "Run a prompt" })).toHaveAttribute("href", "/chat")
    expect(getByRole("link", { name: "Manage all" })).toHaveAttribute("href", "/workspaces")
    expect(getByRole("link", { name: "Continue setup" })).toHaveAttribute("href", "/connect")
  })
})
