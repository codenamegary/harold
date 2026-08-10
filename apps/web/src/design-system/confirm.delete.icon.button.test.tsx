import { afterEach, describe, expect, mock, test } from "bun:test"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { ConfirmDeleteIconButton } from "./ConfirmDeleteIconButton"

afterEach(() => {
  cleanup()
})

describe("ConfirmDeleteIconButton", () => {
  test("starts with a delete icon button and does not call onConfirm yet", () => {
    const onConfirm = mock(() => {})
    const { getByRole, queryByRole } = render(
      <ConfirmDeleteIconButton aria-label="Delete Custom Agent" onConfirm={onConfirm} />,
    )

    expect(getByRole("button", { name: "Delete Custom Agent" })).toBeInTheDocument()
    expect(queryByRole("button", { name: "Confirm" })).toBeNull()
    expect(queryByRole("button", { name: "Cancel" })).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  test("clicking delete reveals confirm and cancel", () => {
    const onConfirm = mock(() => {})
    const { getByRole, queryByRole } = render(
      <ConfirmDeleteIconButton aria-label="Delete Custom Agent" onConfirm={onConfirm} />,
    )

    fireEvent.click(getByRole("button", { name: "Delete Custom Agent" }))

    expect(queryByRole("button", { name: "Delete Custom Agent" })).toBeNull()
    expect(getByRole("button", { name: "Confirm" })).toBeInTheDocument()
    expect(getByRole("button", { name: "Cancel" })).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  test("confirm calls onConfirm", () => {
    const onConfirm = mock(() => {})
    const { getByRole } = render(
      <ConfirmDeleteIconButton aria-label="Delete Custom Agent" onConfirm={onConfirm} />,
    )

    fireEvent.click(getByRole("button", { name: "Delete Custom Agent" }))
    fireEvent.click(getByRole("button", { name: "Confirm" }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test("cancel returns to the delete icon without confirming", () => {
    const onConfirm = mock(() => {})
    const { getByRole, queryByRole } = render(
      <ConfirmDeleteIconButton aria-label="Delete Custom Agent" onConfirm={onConfirm} />,
    )

    fireEvent.click(getByRole("button", { name: "Delete Custom Agent" }))
    fireEvent.click(getByRole("button", { name: "Cancel" }))

    expect(getByRole("button", { name: "Delete Custom Agent" })).toBeInTheDocument()
    expect(queryByRole("button", { name: "Confirm" })).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  test("Escape cancels confirmation", () => {
    const onConfirm = mock(() => {})
    const { getByRole, queryByRole } = render(
      <ConfirmDeleteIconButton aria-label="Delete Custom Agent" onConfirm={onConfirm} />,
    )

    fireEvent.click(getByRole("button", { name: "Delete Custom Agent" }))
    fireEvent.keyDown(window, { key: "Escape" })

    expect(getByRole("button", { name: "Delete Custom Agent" })).toBeInTheDocument()
    expect(queryByRole("button", { name: "Confirm" })).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  test("xs confirm actions use matching height classes", () => {
    const { getByRole, container } = render(
      <ConfirmDeleteIconButton aria-label="Delete Custom Agent" onConfirm={() => {}} />,
    )

    fireEvent.click(getByRole("button", { name: "Delete Custom Agent" }))

    expect(container.firstChild).toHaveClass("h-6")
    expect(getByRole("button", { name: "Confirm" })).toHaveClass("h-6")
    expect(getByRole("button", { name: "Cancel" })).toHaveClass("h-6")
  })

  test("sm size uses the larger row height", () => {
    const { getByRole, container } = render(
      <ConfirmDeleteIconButton
        aria-label="Delete Custom Agent"
        size="sm"
        onConfirm={() => {}}
      />,
    )

    fireEvent.click(getByRole("button", { name: "Delete Custom Agent" }))

    expect(container.firstChild).toHaveClass("h-7")
    expect(getByRole("button", { name: "Confirm" })).toHaveClass("h-7")
  })

  test("pending shows deleting status instead of confirm actions", () => {
    const onConfirm = mock(() => {})
    const { getByRole, queryByRole, rerender } = render(
      <ConfirmDeleteIconButton aria-label="Delete Custom Agent" onConfirm={onConfirm} />,
    )

    fireEvent.click(getByRole("button", { name: "Delete Custom Agent" }))
    fireEvent.click(getByRole("button", { name: "Confirm" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    rerender(
      <ConfirmDeleteIconButton
        aria-label="Delete Custom Agent"
        pending
        onConfirm={onConfirm}
      />,
    )

    expect(queryByRole("button", { name: "Confirm" })).toBeNull()
    expect(queryByRole("button", { name: "Cancel" })).toBeNull()
    expect(getByRole("status")).toHaveTextContent("Deleting…")
  })

  test("Escape does not cancel while pending", () => {
    const onConfirm = mock(() => {})
    const { getByRole, queryByRole } = render(
      <ConfirmDeleteIconButton
        aria-label="Delete Custom Agent"
        pending
        onConfirm={onConfirm}
      />,
    )

    fireEvent.keyDown(window, { key: "Escape" })

    expect(getByRole("status")).toHaveTextContent("Deleting…")
    expect(queryByRole("button", { name: "Delete Custom Agent" })).toBeNull()
  })
})
