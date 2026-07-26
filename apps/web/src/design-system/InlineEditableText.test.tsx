import { describe, expect, test } from "bun:test"
import { fireEvent, render, waitFor } from "@testing-library/react"
import { InlineEditableText } from "./InlineEditableText"

describe("InlineEditableText", () => {
  test("shows text cursor on the idle label", () => {
    const { getByRole } = render(
      <InlineEditableText
        value="agent-server"
        onSave={() => {}}
        onCancel={() => {}}
        isSaving={false}
        ariaLabel="Rename workspace"
      />,
    )

    expect(getByRole("button", { name: "Rename workspace" })).toHaveClass("cursor-text")
  })

  test("enters edit mode when title is clicked", () => {
    const { getByRole } = render(
      <InlineEditableText
        value="agent-server"
        onSave={() => {}}
        onCancel={() => {}}
        isSaving={false}
        ariaLabel="Rename workspace"
      />,
    )

    fireEvent.click(getByRole("button", { name: "Rename workspace" }))

    expect(getByRole("textbox", { name: "Rename workspace" })).toHaveValue("agent-server")
  })

  test("saves on Enter when value changed", async () => {
    const state = { saved: "" }
    const onSave = (value: string) => {
      state.saved = value
    }

    const { getByRole } = render(
      <InlineEditableText
        value="agent-server"
        onSave={onSave}
        onCancel={() => {}}
        isSaving={false}
        ariaLabel="Rename workspace"
      />,
    )

    fireEvent.click(getByRole("button", { name: "Rename workspace" }))
    const input = getByRole("textbox", { name: "Rename workspace" })
    fireEvent.change(input, {
      target: { value: "renamed" },
    })

    await waitFor(() => {
      expect(input).toHaveValue("renamed")
    })

    fireEvent.submit(input.closest("form")!)

    await waitFor(() => {
      expect(state.saved).toBe("renamed")
    })
  })

  test("cancels on Escape", () => {
    const state = { cancelled: false }
    const onCancel = () => {
      state.cancelled = true
    }

    const { getByRole } = render(
      <InlineEditableText
        value="agent-server"
        onSave={() => {}}
        onCancel={onCancel}
        isSaving={false}
        ariaLabel="Rename workspace"
      />,
    )

    fireEvent.click(getByRole("button", { name: "Rename workspace" }))
    fireEvent.keyDown(getByRole("textbox", { name: "Rename workspace" }), {
      key: "Escape",
    })

    expect(state.cancelled).toBe(true)
    expect(getByRole("button", { name: "Rename workspace" })).toBeInTheDocument()
  })

  test("cancels when the input loses focus", () => {
    const state = { cancelled: false }
    const onCancel = () => {
      state.cancelled = true
    }

    const { getByRole, container } = render(
      <div>
        <InlineEditableText
          value="agent-server"
          onSave={() => {}}
          onCancel={onCancel}
          isSaving={false}
          ariaLabel="Rename workspace"
        />
        <button type="button">Outside</button>
      </div>,
    )

    fireEvent.click(getByRole("button", { name: "Rename workspace" }))
    fireEvent.change(getByRole("textbox", { name: "Rename workspace" }), {
      target: { value: "changed" },
    })
    fireEvent.blur(getByRole("textbox", { name: "Rename workspace" }))

    expect(state.cancelled).toBe(true)
    expect(getByRole("button", { name: "Rename workspace" })).toHaveTextContent("agent-server")
    expect(container.querySelector("input")).not.toBeInTheDocument()
  })

  test("cancels when cancel button is clicked", () => {
    const state = { cancelled: false }
    const onCancel = () => {
      state.cancelled = true
    }

    const { getByRole } = render(
      <InlineEditableText
        value="agent-server"
        onSave={() => {}}
        onCancel={onCancel}
        isSaving={false}
        ariaLabel="Rename workspace"
      />,
    )

    fireEvent.click(getByRole("button", { name: "Rename workspace" }))
    fireEvent.click(getByRole("button", { name: "Cancel rename" }))

    expect(state.cancelled).toBe(true)
    expect(getByRole("button", { name: "Rename workspace" })).toBeInTheDocument()
  })
})
