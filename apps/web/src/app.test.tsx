import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { fireEvent, waitFor } from "@testing-library/react"
import { renderWithProviders } from "./query/render.with.providers"
import { AppRoutes } from "./shell/AppRouter"

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

const routePages = [
  { path: "/connect", heading: "Connect" },
  { path: "/workspaces", heading: "Workspaces" },
  { path: "/devices", heading: "Devices" },
  { path: "/chat", heading: "Chat" },
  { path: "/logs", heading: "Logs" },
  { path: "/settings", heading: "Settings" },
] as const

const originalFetch = globalThis.fetch
const originalWebSocket = globalThis.WebSocket

const renderAppRoute = async (path: string) => {
  const view = renderWithProviders(<AppRoutes />, {
    initialEntries: [path],
  })

  await waitFor(() => {
    expect(view.getByText("API connected")).toBeInTheDocument()
  })

  return view
}

describe("routing", () => {
  beforeEach(() => {
    globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
      return {
        url: String(url),
        readyState: 1,
        close: () => undefined,
        send: () => undefined,
        addEventListener: () => undefined,
      }
    } as unknown as typeof WebSocket

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
    globalThis.WebSocket = originalWebSocket
  })

  routePages.forEach(({ path, heading }) => {
    test(`route ${path} renders page landmark and heading`, async () => {
      const { getByRole } = await renderAppRoute(path)

      expect(getByRole("main")).toBeInTheDocument()
      expect(getByRole("heading", { level: 1, name: heading })).toBeInTheDocument()
    })
  })

  test("route / redirects to chat", async () => {
    const { getByRole } = await renderAppRoute("/")

    expect(getByRole("heading", { level: 1, name: "Chat" })).toBeInTheDocument()
    expect(getByRole("link", { name: "Chat" })).toHaveAttribute("aria-current", "page")
  })

  test("mobile menu toggles sidebar open state", async () => {
    const { getByRole } = await renderAppRoute("/chat")

    const sidebar = getByRole("complementary", { name: "Sidebar" })
    expect(sidebar).toHaveAttribute("data-sidebar-open", "false")

    fireEvent.click(getByRole("button", { name: "Toggle navigation" }))
    expect(sidebar).toHaveAttribute("data-sidebar-open", "true")

    fireEvent.click(getByRole("button", { name: "Toggle navigation" }))
    expect(sidebar).toHaveAttribute("data-sidebar-open", "false")
  })
})
