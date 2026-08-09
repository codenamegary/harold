import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import React, { useState } from "react"
import { EditableStringList, moveEditableStringListItem } from "./EditableStringList"

const ControlledList: React.FC<{
  initial?: readonly string[]
  disabled?: boolean
  sortable?: boolean
}> = ({ initial = [], disabled, sortable }) => {
  const [value, setValue] = useState<string[]>([...initial])

  return (
    <EditableStringList
      value={value}
      onChange={setValue}
      disabled={disabled}
      sortable={sortable}
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

  test("Enter on the last sortable row adds an item", () => {
    const { getByLabelText } = render(<ControlledList initial={["acp"]} sortable />)

    fireEvent.submit(getByLabelText("Args item 1").closest("form")!)

    expect(getByLabelText("Args item 2")).toHaveValue("")
  })

  test("disables inputs and actions when disabled", () => {
    const { getByLabelText, getByRole } = render(
      <ControlledList initial={["acp"]} disabled />,
    )

    expect(getByLabelText("Args item 1")).toBeDisabled()
    expect(getByRole("button", { name: "Remove Args item 1" })).toBeDisabled()
    expect(getByRole("button", { name: "Add Args item" })).toBeDisabled()
  })

  test("shows reorder handles when sortable", () => {
    const { getByRole, queryByRole } = render(
      <ControlledList initial={["-y", "pkg", "acp"]} sortable />,
    )

    expect(getByRole("button", { name: "Reorder Args item 1" })).toBeInTheDocument()
    expect(getByRole("button", { name: "Reorder Args item 2" })).toBeInTheDocument()
    expect(queryByRole("button", { name: "Reorder Args item 4" })).not.toBeInTheDocument()
  })

  test("hides reorder handles when not sortable", () => {
    const { queryByRole } = render(<ControlledList initial={["acp"]} />)

    expect(queryByRole("button", { name: "Reorder Args item 1" })).not.toBeInTheDocument()
  })

  test("disables reorder handles when sortable and disabled", () => {
    const { getByRole } = render(<ControlledList initial={["acp"]} sortable disabled />)

    expect(getByRole("button", { name: "Reorder Args item 1" })).toBeDisabled()
  })

  test("moveEditableStringListItem reorders by index", () => {
    expect(moveEditableStringListItem(["-y", "pkg", "acp"], 2, 0)).toEqual(["acp", "-y", "pkg"])
    expect(moveEditableStringListItem(["-y", "pkg", "acp"], 0, 2)).toEqual(["pkg", "acp", "-y"])
  })

  test("moveEditableStringListItem is a no-op for invalid indexes", () => {
    expect(moveEditableStringListItem(["acp"], 0, 0)).toEqual(["acp"])
    expect(moveEditableStringListItem(["acp"], -1, 0)).toEqual(["acp"])
    expect(moveEditableStringListItem(["acp"], 0, 3)).toEqual(["acp"])
  })
})
