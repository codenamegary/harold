import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import { ActionField, ActionTextInput, FieldActionButton } from "./ActionTextInput"

describe("ActionTextInput", () => {
  test("renders the action button inside the field shell at the end by default", () => {
    const { getByRole } = render(
      <ActionTextInput
        aria-label="Allowed root path"
        action={{
          "aria-label": "Add root",
          children: "save",
        }}
      />,
    )

    const input = getByRole("textbox", { name: "Allowed root path" })
    const button = getByRole("button", { name: "Add root" })
    const shell = input.parentElement

    expect(shell?.tagName.toLowerCase()).toBe("form")
    expect(shell).toHaveClass("border-line-input")
    expect(shell?.lastElementChild).toBe(button)
  })

  test("places the action at the start when requested", () => {
    const { getByRole } = render(
      <ActionTextInput
        aria-label="Search"
        action={{
          position: "start",
          "aria-label": "Clear",
          children: "x",
        }}
      />,
    )

    const input = getByRole("textbox", { name: "Search" })
    const button = getByRole("button", { name: "Clear" })

    expect(input.parentElement?.firstElementChild).toBe(button)
  })

  test("fires the action click handler", () => {
    let clicked = false
    const { getByRole } = render(
      <ActionTextInput
        aria-label="Path"
        action={{
          "aria-label": "Save path",
          onClick: () => {
            clicked = true
          },
          children: "save",
        }}
      />,
    )

    fireEvent.click(getByRole("button", { name: "Save path" }))
    expect(clicked).toBe(true)
  })

  test("Enter submits the action by default", () => {
    let clicked = false
    const { getByRole } = render(
      <ActionTextInput
        aria-label="Path"
        action={{
          "aria-label": "Save path",
          onClick: () => {
            clicked = true
          },
          children: "save",
        }}
      />,
    )

    fireEvent.submit(getByRole("textbox", { name: "Path" }).parentElement as HTMLFormElement)
    expect(clicked).toBe(true)
  })

  test("Enter does not submit when submitOnEnter is false", () => {
    let clicked = false
    const { getByRole } = render(
      <ActionTextInput
        aria-label="Path"
        submitOnEnter={false}
        action={{
          "aria-label": "Save path",
          onClick: () => {
            clicked = true
          },
          children: "save",
        }}
      />,
    )

    fireEvent.submit(getByRole("textbox", { name: "Path" }).parentElement as HTMLFormElement)
    expect(clicked).toBe(false)
  })

  test("Enter does not submit when the action is disabled", () => {
    let clicked = false
    const { getByRole } = render(
      <ActionTextInput
        aria-label="Path"
        action={{
          "aria-label": "Save path",
          disabled: true,
          onClick: () => {
            clicked = true
          },
          children: "save",
        }}
      />,
    )

    fireEvent.submit(getByRole("textbox", { name: "Path" }).parentElement as HTMLFormElement)
    expect(clicked).toBe(false)
  })

  test("click still saves when submitOnEnter is false", () => {
    let clicked = false
    const { getByRole } = render(
      <ActionTextInput
        aria-label="Path"
        submitOnEnter={false}
        action={{
          "aria-label": "Save path",
          onClick: () => {
            clicked = true
          },
          children: "save",
        }}
      />,
    )

    fireEvent.click(getByRole("button", { name: "Save path" }))
    expect(clicked).toBe(true)
  })
})

describe("ActionField", () => {
  test("embeds a trailing action beside static content", () => {
    const { getByText, getByRole } = render(
      <ActionField
        action={
          <FieldActionButton aria-label="Remove /tmp/project">
            remove
          </FieldActionButton>
        }
      >
        <code className="min-w-0 flex-1 truncate">/tmp/project</code>
      </ActionField>,
    )

    expect(getByText("/tmp/project")).toBeInTheDocument()
    expect(getByRole("button", { name: "Remove /tmp/project" })).toBeInTheDocument()
  })
})
