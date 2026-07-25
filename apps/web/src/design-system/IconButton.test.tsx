import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { IconButton } from "./IconButton"

describe("IconButton", () => {
  test("renders square icon button styling", () => {
    const { getByRole } = render(<IconButton aria-label="Settings">⚙</IconButton>)

    const button = getByRole("button", { name: "Settings" })
    expect(button).toHaveClass("size-[34px]")
    expect(button).toHaveClass("border-line")
  })

  test("disabled icon button is not interactive", () => {
    const { getByRole } = render(
      <IconButton aria-label="Settings" disabled>
        ⚙
      </IconButton>,
    )

    const button = getByRole("button", { name: "Settings" })
    expect(button).toBeDisabled()
    expect(button).toHaveClass("opacity-50")
  })

  test("aria-disabled icon button exposes aria-disabled", () => {
    const { getByRole } = render(
      <IconButton aria-label="Settings" aria-disabled>
        ⚙
      </IconButton>,
    )

    const button = getByRole("button", { name: "Settings" })
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveClass("pointer-events-none")
  })
})
