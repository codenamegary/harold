import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { NavItem } from "./NavItem"

describe("NavItem", () => {
  test("active nav item uses active styling", () => {
    const { getByRole } = render(
      <NavItem active icon={<span>⌂</span>}>
        Dashboard
      </NavItem>,
    )

    const button = getByRole("button", { name: /Dashboard/ })
    expect(button).toHaveClass("bg-[#151920]")
    expect(button).toHaveAttribute("aria-current", "page")
  })

  test("inactive nav item uses muted styling", () => {
    const { getByRole } = render(
      <NavItem icon={<span>⌂</span>}>
        Dashboard
      </NavItem>,
    )

    expect(getByRole("button", { name: /Dashboard/ })).toHaveClass("text-[#7f8998]")
  })

  test("disabled nav item is not interactive", () => {
    const { getByRole } = render(
      <NavItem disabled icon={<span>⌂</span>}>
        Dashboard
      </NavItem>,
    )

    const button = getByRole("button", { name: /Dashboard/ })
    expect(button).toBeDisabled()
    expect(button).toHaveClass("opacity-50")
  })

  test("aria-disabled nav item exposes aria-disabled", () => {
    const { getByRole } = render(
      <NavItem aria-disabled icon={<span>⌂</span>}>
        Dashboard
      </NavItem>,
    )

    const button = getByRole("button", { name: /Dashboard/ })
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveClass("pointer-events-none")
  })
})
