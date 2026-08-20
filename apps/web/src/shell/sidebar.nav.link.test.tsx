import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { SidebarNavLink } from "./SidebarNavLink"

describe("SidebarNavLink", () => {
  test("icon span is large enough to read", () => {
    const { getByRole } = render(
      <MemoryRouter>
        <SidebarNavLink to="/" icon={<span>⌂</span>}>
          Overview
        </SidebarNavLink>
      </MemoryRouter>,
    )

    const link = getByRole("link", { name: "Overview" })
    const iconSpan = link.querySelector("span[aria-hidden='true']")
    expect(iconSpan).not.toBeNull()
  })
})
