import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { useState } from "react"
import { PromptInput } from "./PromptInput"
import { Plugin, rangeTouches } from "./prompt.input.model"

const textPlugin: Plugin = {
  kind: "text",
  render: ({ chars }) => chars,
}

const commandPlugin: Plugin = {
  kind: "command",
  match: (text, offset) => {
    const value = "/cmd"
    if (!text.startsWith(value, offset)) {
      return null
    }
    if (offset !== 0 && !/\s/.test(text[offset - 1] ?? "")) {
      return null
    }
    return {
      kind: "command",
      value,
      start: offset,
      end: offset + value.length,
    }
  },
  render: ({ token, selection, raw, chars }) => {
    const complete = raw[token.end] === " "
    if (!complete || rangeTouches(token, selection)) {
      return chars
    }
    return <span data-token-start={token.start}>{token.value}</span>
  },
}

const Harness: React.FC<{ initial: string }> = ({ initial }) => {
  const [value, setValue] = useState(initial)
  return (
    <PromptInput
      aria-label="Prompt"
      value={value}
      onChange={setValue}
      plugins={[textPlugin, commandPlugin]}
    />
  )
}

describe("PromptInput", () => {
  test("renders matched tokens through plugins", () => {
    const { getByRole } = render(
      <PromptInput
        aria-label="Prompt"
        value="hello /cmd "
        onChange={() => undefined}
        plugins={[textPlugin, commandPlugin]}
      />,
    )

    const field = getByRole("textbox", { name: "Prompt" })
    expect(field).toHaveTextContent("hello /cmd")
    expect(field.querySelector("[data-token-start]")).toHaveTextContent("/cmd")
  })

  test("throws when no text plugin is registered", () => {
    expect(() =>
      render(
        <PromptInput
          aria-label="Prompt"
          value="hello"
          onChange={() => undefined}
          plugins={[commandPlugin]}
        />,
      ),
    ).toThrow(/without match/)
  })

  test("inserts typed characters through onChange", async () => {
    const user = userEvent.setup()
    const { getByRole } = render(<Harness initial="hi" />)
    const field = getByRole("textbox", { name: "Prompt" })
    await user.click(field)
    await user.keyboard("!")
    expect(field).toHaveTextContent("hi!")
  })

  test("clicking placeholder text focuses the field", () => {
    const { getByRole, getByText } = render(
      <PromptInput
        aria-label="Prompt"
        placeholder="Ask the agent…"
        value=""
        onChange={() => undefined}
        plugins={[textPlugin]}
      />,
    )

    fireEvent.mouseDown(getByText("Ask the agent…"))
    expect(getByRole("textbox", { name: "Prompt" })).toHaveFocus()
  })

  test("clicking an empty field then typing inserts text", async () => {
    const user = userEvent.setup()
    const { getByRole } = render(<Harness initial="" />)
    const field = getByRole("textbox", { name: "Prompt" })
    await user.click(field)
    await user.keyboard("ab")
    expect(field).toHaveTextContent("ab")
  })

  test("clicking a character focuses the field", () => {
    const { getByRole } = render(<Harness initial="hi" />)
    const field = getByRole("textbox", { name: "Prompt" })
    const letter = field.querySelector("[data-offset]")
    if (letter === null) {
      throw new Error("expected a character target")
    }
    fireEvent.mouseDown(letter)
    expect(field).toHaveFocus()
  })

  test("clicking a chip expands it", () => {
    const { getByRole } = render(<Harness initial="hello /cmd " />)
    const field = getByRole("textbox", { name: "Prompt" })
    const chip = field.querySelector("[data-token-start]")
    if (chip === null) {
      throw new Error("expected a chip")
    }
    fireEvent.mouseDown(chip)
    expect(field.querySelector("[data-token-start]")).toBeNull()
  })

  test("disabled exposes aria-disabled for the textbox", () => {
    const { getByRole } = render(
      <PromptInput
        aria-label="Prompt"
        value=""
        onChange={() => undefined}
        plugins={[textPlugin]}
        disabled
      />,
    )

    const field = getByRole("textbox", { name: "Prompt" })
    expect(field).toHaveAttribute("aria-disabled", "true")
  })

  test("mod+a selects all and copy writes the selected text", () => {
    const { getByRole } = render(<Harness initial="hello" />)
    const field = getByRole("textbox", { name: "Prompt" })
    fireEvent.keyDown(field, { key: "a", ctrlKey: true })
    expect(field.querySelectorAll(".prompt-input-selected")).toHaveLength(5)

    const stored = { text: "" }
    fireEvent.copy(field, {
      clipboardData: {
        setData: (_type: string, value: string) => {
          stored.text = value
        },
      },
    })
    expect(stored.text).toBe("hello")
  })

  test("paste replaces the selection", () => {
    const { getByRole } = render(<Harness initial="hello" />)
    const field = getByRole("textbox", { name: "Prompt" })
    fireEvent.keyDown(field, { key: "a", ctrlKey: true })
    fireEvent.paste(field, {
      clipboardData: { getData: () => "yo" },
    })
    expect(field).toHaveTextContent("yo")
  })

  test("cut removes the selection", () => {
    const stored = { text: "" }
    const { getByRole } = render(<Harness initial="hello" />)
    const field = getByRole("textbox", { name: "Prompt" })
    fireEvent.keyDown(field, { key: "a", ctrlKey: true })
    fireEvent.cut(field, {
      clipboardData: {
        setData: (_type: string, value: string) => {
          stored.text = value
        },
      },
    })
    expect(stored.text).toBe("hello")
    expect(field).toHaveTextContent("")
  })

  test("shift+arrow paints a selection", () => {
    const { getByRole } = render(<Harness initial="hi" />)
    const field = getByRole("textbox", { name: "Prompt" })
    fireEvent.keyDown(field, { key: "ArrowLeft", shiftKey: true })
    expect(field.querySelectorAll(".prompt-input-selected")).toHaveLength(1)
  })

  test("Enter at the end opens a line on the first press", () => {
    const View: React.FC = () => {
      const [value, setValue] = useState("hi")
      return (
        <div>
          <PromptInput
            aria-label="Prompt"
            value={value}
            onChange={setValue}
            plugins={[textPlugin]}
          />
          <output data-testid="value">{value}</output>
        </div>
      )
    }
    const { getByRole, getByTestId } = render(<View />)
    const field = getByRole("textbox", { name: "Prompt" })
    fireEvent.focus(field)
    fireEvent.keyDown(field, { key: "Enter" })
    expect(getByTestId("value").textContent).toBe("hi\n")
    expect(field.querySelector("[data-trailing-break]")).not.toBeNull()
  })

  test("mod+enter is left unhandled for the parent", () => {
    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
      }
    }
    const { getByRole } = render(
      <PromptInput
        aria-label="Prompt"
        value="hi"
        onChange={() => undefined}
        plugins={[textPlugin]}
        onKeyDown={onKeyDown}
      />,
    )
    const field = getByRole("textbox", { name: "Prompt" })
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true })
    expect(field).toHaveTextContent("hi")
  })
})
