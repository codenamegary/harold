import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { render, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { ConnectionProvider } from "../connection/ConnectionProvider"
import { OverviewPage } from "../shell/pages/OverviewPage"

const validStatus = {
  version: "0.1.0",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-01-01T00:00:00.000Z",
  uptimeSeconds: 3661,
  acp: {
    state: "ready",
    activeSessions: 0,
  },
} as const

const originalFetch = globalThis.fetch

const renderOverviewPage = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <ConnectionProvider>
        <OverviewPage />
      </ConnectionProvider>
    </MemoryRouter>,
  )

describe("OverviewPage", () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(validStatus), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ) as typeof fetch
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
