import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { Button } from "./Button"

describe("Button", () => {
  test("primary variant uses lime background", () => {
    const { getByRole } = render(<Button variant="primary">Save</Button>)

    expect(getByRole("button", { name: "Save" })).toHaveClass("bg-lime")
  })

  test("secondary variant uses panel styling", () => {
    const { getByRole } = render(<Button variant="secondary">Cancel</Button>)

    expect(getByRole("button", { name: "Cancel" })).toHaveClass("bg-panel-2")
  })

  test("text variant uses transparent background", () => {
    const { getByRole } = render(<Button variant="text">Back</Button>)

    expect(getByRole("button", { name: "Back" })).toHaveClass("bg-transparent")
  })

  test("submit variant uses lime background for form CTAs", () => {
    const { getByRole } = render(
      <Button type="submit" variant="submit">
        Save
      </Button>,
    )

    const button = getByRole("button", { name: "Save" })
    expect(button).toHaveClass("bg-lime")
    expect(button).toHaveAttribute("type", "submit")
  })

  test("sm size uses compact height", () => {
    const { getByRole } = render(
      <Button size="sm" variant="secondary">
        Reset
      </Button>,
    )

    expect(getByRole("button", { name: "Reset" })).toHaveClass("min-h-7")
  })

  test("xs size matches icon-row height", () => {
    const { getByRole } = render(
      <Button size="xs" variant="danger">
        Confirm
      </Button>,
    )

    const button = getByRole("button", { name: "Confirm" })
    expect(button).toHaveClass("h-6")
    expect(button).toHaveClass("min-h-6")
    expect(button).toHaveClass("text-xs")
  })

  test("disabled button is not interactive", () => {
    const { getByRole } = render(<Button disabled>Save</Button>)

    const button = getByRole("button", { name: "Save" })
    expect(button).toBeDisabled()
    expect(button).toHaveClass("opacity-50")
    expect(button).toHaveClass("pointer-events-none")
  })

  test("aria-disabled button exposes aria-disabled", () => {
    const { getByRole } = render(<Button aria-disabled>Save</Button>)

    const button = getByRole("button", { name: "Save" })
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveClass("opacity-50")
    expect(button).toHaveClass("pointer-events-none")
  })

  test("danger variant uses danger styling", () => {
    const { getByRole } = render(<Button variant="danger">Confirm</Button>)

    expect(getByRole("button", { name: "Confirm" })).toHaveClass("bg-danger/15")
  })
})
