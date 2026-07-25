import { describe, expect, test } from "bun:test"
import { fireEvent, render, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AppRoutes } from "./shell/AppRouter"

const routePages = [
  { path: "/", heading: "Overview" },
  { path: "/connect", heading: "Connect" },
  { path: "/workspaces", heading: "Workspaces" },
  { path: "/devices", heading: "Devices" },
  { path: "/chat", heading: "Agent playground" },
  { path: "/settings", heading: "Settings" },
] as const

describe("routing", () => {
  routePages.forEach(({ path, heading }) => {
    test(`route ${path} renders page landmark and heading`, () => {
      const { getByRole } = render(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>,
      )

      const main = getByRole("main")
      expect(main).toBeInTheDocument()
      expect(within(main).getByRole("heading", { level: 1, name: heading })).toBeInTheDocument()
    })
  })

  test("mobile menu toggles sidebar open state", () => {
    const { getByRole } = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    )

    const sidebar = getByRole("complementary", { name: "Sidebar" })
    expect(sidebar).toHaveAttribute("data-sidebar-open", "false")

    fireEvent.click(getByRole("button", { name: "Toggle navigation" }))
    expect(sidebar).toHaveAttribute("data-sidebar-open", "true")

    fireEvent.click(getByRole("button", { name: "Toggle navigation" }))
    expect(sidebar).toHaveAttribute("data-sidebar-open", "false")
  })
})
