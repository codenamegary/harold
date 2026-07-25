import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { FieldLabel } from "./FieldLabel"

describe("FieldLabel", () => {
  test("renders form field label", () => {
    const { getByText } = render(<FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>)

    const label = getByText("Workspace name")
    expect(label).toHaveAttribute("for", "workspace-name")
    expect(label).toHaveClass("text-label")
  })
})
