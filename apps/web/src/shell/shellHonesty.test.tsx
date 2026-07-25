import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { fireEvent, render, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AppRoutes } from "./AppRouter"

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

const shellRoutes = [
  { path: "/" },
  { path: "/connect" },
  { path: "/workspaces" },
  { path: "/devices" },
  { path: "/chat" },
  { path: "/settings" },
] as const

const forbiddenLabelPatterns = [/demo data/i, /mock-success/i, /mock success/i] as const

const originalFetch = globalThis.fetch

const renderShellRoute = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

const waitForShellReady = async (getByRole: ReturnType<typeof render>["getByRole"]) => {
  await waitFor(() => {
    expect(getByRole("main")).toBeInTheDocument()
  })
}

describe("shell honesty", () => {
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

  describe("forbidden labels", () => {
    shellRoutes.forEach(({ path }) => {
      test(`route ${path} has no demo or mock-success labels`, async () => {
        const { container, getByRole } = renderShellRoute(path)

        await waitForShellReady(getByRole)

        const text = container.textContent ?? ""

        forbiddenLabelPatterns.forEach((pattern) => {
          expect(text).not.toMatch(pattern)
        })
      })
    })
  })

  describe("overview disabled honesty", () => {
    test("coming soon metric cards show muted copy without numeric placeholders", async () => {
      const { getByRole } = renderShellRoute("/")

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
  })

  describe("connect wizard disabled honesty", () => {
    test("test connection and pair device actions are disabled", async () => {
      const { getByRole } = renderShellRoute("/connect")

      await waitForShellReady(getByRole)

      fireEvent.click(getByRole("button", { name: /test connection/i }))
      expect(getByRole("button", { name: /run connection test/i })).toBeDisabled()

      fireEvent.click(getByRole("button", { name: /pair device/i }))
      expect(getByRole("button", { name: /regenerate/i })).toBeDisabled()
      expect(getByRole("button", { name: /view paired devices/i })).toBeDisabled()
    })
  })

  describe("workspaces disabled honesty", () => {
    test("add workspace, search, and filter controls are disabled", async () => {
      const { getByRole } = renderShellRoute("/workspaces")

      await waitForShellReady(getByRole)

      expect(getByRole("button", { name: "+ Add workspace" })).toBeDisabled()
      expect(getByRole("searchbox", { name: "Search workspaces" })).toBeDisabled()
      expect(getByRole("button", { name: "All" })).toBeDisabled()
      expect(getByRole("button", { name: "Active" })).toBeDisabled()
      expect(getByRole("button", { name: "Paused" })).toBeDisabled()
    })
  })

  describe("devices disabled honesty", () => {
    test("pair action is disabled and revoke actions are absent", async () => {
      const { getByRole, queryByRole } = renderShellRoute("/devices")

      await waitForShellReady(getByRole)

      expect(getByRole("button", { name: "+ Pair new device" })).toBeDisabled()
      expect(queryByRole("button", { name: /revoke/i })).not.toBeInTheDocument()
    })
  })

  describe("settings disabled honesty", () => {
    test("runtime toggles, diagnostics, and provider connect actions are disabled", async () => {
      const { getByRole } = renderShellRoute("/settings")

      await waitForShellReady(getByRole)

      expect(getByRole("checkbox", { name: /allow local network/i })).toBeDisabled()
      expect(getByRole("checkbox", { name: /detailed request logs/i })).toBeDisabled()
      expect(getByRole("button", { name: "Download diagnostics" })).toBeDisabled()
      expect(getByRole("button", { name: "Connect GitHub" })).toBeDisabled()
      expect(getByRole("button", { name: "Connect GitLab" })).toBeDisabled()
    })
  })

  describe("chat disabled honesty", () => {
    test("selects, composer, send, and clear chat are disabled", async () => {
      const { getByRole } = renderShellRoute("/chat")

      await waitForShellReady(getByRole)

      expect(getByRole("combobox", { name: "Workspace" })).toBeDisabled()
      expect(getByRole("combobox", { name: "Agent" })).toBeDisabled()
      expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
      expect(getByRole("button", { name: "Send message" })).toBeDisabled()
      expect(getByRole("button", { name: "Clear chat" })).toBeDisabled()
    })
  })
})
