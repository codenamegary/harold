import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { fireEvent, render, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
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
  { path: "/", heading: "Overview" },
  { path: "/connect", heading: "Connect" },
  { path: "/workspaces", heading: "Workspaces" },
  { path: "/devices", heading: "Devices" },
  { path: "/chat", heading: "Agent playground" },
  { path: "/settings", heading: "Settings" },
] as const

const originalFetch = globalThis.fetch

const renderAppRoute = async (path: string) => {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

  await waitFor(() => {
    expect(view.getByText("API connected")).toBeInTheDocument()
  })

  return view
}

describe("routing", () => {
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

  routePages.forEach(({ path, heading }) => {
    test(`route ${path} renders page landmark and heading`, async () => {
      const { getByRole } = await renderAppRoute(path)

      expect(getByRole("main")).toBeInTheDocument()
      expect(getByRole("heading", { level: 1, name: heading })).toBeInTheDocument()
    })
  })

  test("mobile menu toggles sidebar open state", async () => {
    const { getByRole } = await renderAppRoute("/")

    const sidebar = getByRole("complementary", { name: "Sidebar" })
    expect(sidebar).toHaveAttribute("data-sidebar-open", "false")

    fireEvent.click(getByRole("button", { name: "Toggle navigation" }))
    expect(sidebar).toHaveAttribute("data-sidebar-open", "true")

    fireEvent.click(getByRole("button", { name: "Toggle navigation" }))
    expect(sidebar).toHaveAttribute("data-sidebar-open", "false")
  })
})
