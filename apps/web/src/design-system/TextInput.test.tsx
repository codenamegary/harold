import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { TextInput } from "./TextInput"

describe("TextInput", () => {
  test("renders text input styling", () => {
    const { getByRole } = render(<TextInput aria-label="Workspace name" />)

    const input = getByRole("textbox", { name: "Workspace name" })
    expect(input).toHaveClass("bg-[#090c10]")
    expect(input).toHaveClass("border-[#2e3540]")
  })

  test("disabled text input is not editable", () => {
    const { getByRole } = render(<TextInput aria-label="Workspace name" disabled />)

    const input = getByRole("textbox", { name: "Workspace name" })
    expect(input).toBeDisabled()
    expect(input).toHaveClass("opacity-50")
  })

  test("aria-disabled text input exposes aria-disabled", () => {
    const { getByRole } = render(<TextInput aria-label="Workspace name" aria-disabled />)

    const input = getByRole("textbox", { name: "Workspace name" })
    expect(input).toHaveAttribute("aria-disabled", "true")
    expect(input).toHaveClass("pointer-events-none")
  })
})
