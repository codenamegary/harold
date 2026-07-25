import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import { Modal } from "./Modal"

describe("Modal", () => {
  test("does not render when closed", () => {
    const { queryByRole } = render(
      <Modal open={false} onClose={() => {}} title="Add workspace">
        Body
      </Modal>,
    )

    expect(queryByRole("dialog")).toBeNull()
  })

  test("renders title and content when open", () => {
    const { getByRole, getByText } = render(
      <Modal open onClose={() => {}} title="Add workspace">
        Body copy
      </Modal>,
    )

    expect(getByRole("dialog")).toBeInTheDocument()
    expect(getByText("Add workspace")).toBeInTheDocument()
    expect(getByText("Body copy")).toBeInTheDocument()
  })

  test("renders actions slot", () => {
    const { getByRole } = render(
      <Modal
        open
        onClose={() => {}}
        title="Add workspace"
        actions={<button type="button">Save</button>}
      >
        Body
      </Modal>,
    )

    expect(getByRole("button", { name: "Save" })).toBeInTheDocument()
  })

  test("calls onClose when backdrop is clicked", () => {
    const state = { closed: false }
    const onClose = () => {
      state.closed = true
    }

    const { getByRole } = render(
      <Modal open onClose={onClose} title="Add workspace">
        Body
      </Modal>,
    )

    const dialog = getByRole("dialog")
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(state.closed).toBe(true)
  })
})
