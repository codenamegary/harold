import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { CopyButton } from "./CopyButton"

const originalClipboard = navigator.clipboard
const writeText = mock(() => Promise.resolve())

afterEach(() => {
  cleanup()
  writeText.mockClear()
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  })
})

describe("CopyButton", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
  })

  test("copies the value to the clipboard", async () => {
    const { getByRole } = render(<CopyButton value="hello from clipboard" />)

    fireEvent.click(getByRole("button", { name: "Copy" }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("hello from clipboard")
    })
  })

  test("shows a copied tooltip after a successful copy", async () => {
    const { getByRole, getByText } = render(<CopyButton value="snippet" />)

    fireEvent.click(getByRole("button", { name: "Copy" }))

    await waitFor(() => {
      expect(getByText("Copied")).toBeVisible()
    })
    expect(getByRole("status")).toHaveClass("copy-button-feedback")
  })

  test("removes the tooltip when the css animation ends", async () => {
    const { getByRole, queryByRole } = render(<CopyButton value="snippet" />)

    fireEvent.click(getByRole("button", { name: "Copy" }))

    await waitFor(() => {
      expect(getByRole("status")).toBeInTheDocument()
    })

    fireEvent.animationEnd(getByRole("status"))

    await waitFor(() => {
      expect(queryByRole("status")).toBeNull()
    })
  })

  test("does not copy when disabled", () => {
    const { getByRole } = render(<CopyButton value="snippet" disabled />)

    fireEvent.click(getByRole("button", { name: "Copy" }))

    expect(writeText).not.toHaveBeenCalled()
  })

  test("does not copy an empty value", () => {
    const { getByRole } = render(<CopyButton value="" />)

    expect(getByRole("button", { name: "Copy" })).toBeDisabled()
    fireEvent.click(getByRole("button", { name: "Copy" }))
    expect(writeText).not.toHaveBeenCalled()
  })
})
