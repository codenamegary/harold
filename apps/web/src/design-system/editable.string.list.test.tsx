import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import React, { useState } from "react"
import { EditableStringList } from "./EditableStringList"

const ControlledList: React.FC<{
  initial?: readonly string[]
  disabled?: boolean
}> = ({ initial = [], disabled }) => {
  const [value, setValue] = useState<string[]>([...initial])

  return (
    <EditableStringList
      value={value}
      onChange={setValue}
      disabled={disabled}
      aria-label="Args"
    />
  )
}

describe("EditableStringList", () => {
  test("renders controlled string items", () => {
    const { getByLabelText } = render(
      <EditableStringList
        value={["acp", "--verbose"]}
        onChange={() => {}}
        aria-label="Args"
      />,
    )

    expect(getByLabelText("Args item 1")).toHaveValue("acp")
    expect(getByLabelText("Args item 2")).toHaveValue("--verbose")
  })

  test("adds an empty item", () => {
    const { getByRole, getByLabelText } = render(<ControlledList initial={["acp"]} />)

    fireEvent.click(getByRole("button", { name: "Add Args item" }))

    expect(getByLabelText("Args item 1")).toHaveValue("acp")
    expect(getByLabelText("Args item 2")).toHaveValue("")
  })

  test("removes an item", () => {
    const { getByRole, queryByLabelText, getByLabelText } = render(
      <ControlledList initial={["acp", "--verbose"]} />,
    )

    fireEvent.click(getByRole("button", { name: "Remove Args item 1" }))

    expect(queryByLabelText("Args item 2")).not.toBeInTheDocument()
    expect(getByLabelText("Args item 1")).toHaveValue("--verbose")
  })

  test("changes an item value", () => {
    const { getByLabelText } = render(<ControlledList initial={["acp"]} />)

    fireEvent.change(getByLabelText("Args item 1"), {
      target: { value: "claude" },
    })

    expect(getByLabelText("Args item 1")).toHaveValue("claude")
  })

  test("Enter on the last row adds an item", () => {
    const { getByLabelText } = render(<ControlledList initial={["acp"]} />)

    fireEvent.submit(getByLabelText("Args item 1").closest("form")!)

    expect(getByLabelText("Args item 2")).toHaveValue("")
  })

  test("Enter on a non-last row does not add", () => {
    const { getByLabelText, queryByLabelText } = render(
      <ControlledList initial={["acp", "--verbose"]} />,
    )

    fireEvent.submit(getByLabelText("Args item 1").closest("form")!)

    expect(queryByLabelText("Args item 3")).not.toBeInTheDocument()
  })

  test("disables inputs and actions when disabled", () => {
    const { getByLabelText, getByRole } = render(
      <ControlledList initial={["acp"]} disabled />,
    )

    expect(getByLabelText("Args item 1")).toBeDisabled()
    expect(getByRole("button", { name: "Remove Args item 1" })).toBeDisabled()
    expect(getByRole("button", { name: "Add Args item" })).toBeDisabled()
  })
})
