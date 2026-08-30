import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import { useState } from "react"
import { PromptInput } from "./PromptInput"
import { Matcher, Plugin, PluginRenderProps } from "./prompt.input.model"

const paint = ({ chars }: PluginRenderProps) => chars

const matchCommand: Matcher = (text, offset) => {
  if (text[offset] !== "/") {
    return null
  }
  if (offset !== 0 && !/\s/.test(text[offset - 1] ?? "")) {
    return null
  }
  const value = text.slice(offset).match(/^\/\S*/)?.[0] ?? "/"
  return { kind: "command", value, start: offset, end: offset + value.length }
}

const names = ["plan", "play", "review"]

const matches = (query: string) =>
  names.filter((name) => name.startsWith(query))

const textPlugin: Plugin = { kind: "text", render: paint }

const commandPlugin: Plugin = {
  kind: "command",
  match: matchCommand,
  render: paint,
  overlay: ({ token, replaceToken }) => (
    <ul aria-label="Available commands">
      {matches(token.value.slice(1)).map((name) => (
        <li key={name}>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => replaceToken(`/${name}`)}
          >
            /{name}
          </button>
        </li>
      ))}
    </ul>
  ),
  onCommit: (token) => {
    const first = matches(token.value.slice(1))[0]
    return first === undefined ? null : `/${first}`
  },
}

const plugins = [textPlugin, commandPlugin]

type HarnessProps = {
  initial: string
}

const Harness = ({ initial }: HarnessProps) => {
  const [value, setValue] = useState(initial)
  return (
    <div>
      <PromptInput
        aria-label="Prompt"
        value={value}
        onChange={setValue}
        plugins={plugins}
      />
      <output data-testid="value">{value}</output>
    </div>
  )
}

const setup = (initial: string) => {
  const view = render(<Harness initial={initial} />)
  const field = view.getByRole("textbox", { name: "Prompt" })
  fireEvent.focus(field)
  const currentValue = () => view.getByTestId("value").textContent
  return { ...view, field, currentValue }
}

describe("PromptInput overlay", () => {
  test("mounts on the token holding the caret", () => {
    const { getByRole } = setup("go /pl")
    expect(getByRole("list", { name: "Available commands" })).toBeInTheDocument()
  })

  test("stays closed when the caret is on another token", () => {
    const { field, queryByRole } = setup("go /pl")
    fireEvent.keyDown(field, { key: "Home" })
    expect(queryByRole("list", { name: "Available commands" })).toBeNull()
  })

  test("stays closed while text is selected", () => {
    const { field, queryByRole } = setup("go /pl")
    fireEvent.keyDown(field, { key: "ArrowLeft", shiftKey: true })
    expect(queryByRole("list", { name: "Available commands" })).toBeNull()
  })

  test("stays closed when the field is not focused", () => {
    const { field, queryByRole } = setup("go /pl")
    fireEvent.blur(field)
    expect(queryByRole("list", { name: "Available commands" })).toBeNull()
  })

  test("filters as the token narrows", () => {
    const { getByRole, queryByRole } = setup("go /pla")
    expect(getByRole("button", { name: "/plan" })).toBeInTheDocument()
    expect(queryByRole("button", { name: "/review" })).toBeNull()
  })

  test("clicking a row replaces the token and adds a space", () => {
    const { getByRole, currentValue } = setup("go /pl")
    fireEvent.click(getByRole("button", { name: "/plan" }))
    expect(currentValue()).toBe("go /plan ")
  })

  test("Enter commits the first match", () => {
    const { field, currentValue } = setup("go /pl")
    fireEvent.keyDown(field, { key: "Enter" })
    expect(currentValue()).toBe("go /plan ")
  })

  test("Enter inserts a newline when nothing matches", () => {
    const { field, currentValue } = setup("go /zz")
    fireEvent.keyDown(field, { key: "Enter" })
    expect(currentValue()).toBe("go /zz\n")
  })

  test("Enter inserts a newline when no token is active", () => {
    const { field, currentValue } = setup("go")
    fireEvent.keyDown(field, { key: "Home" })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(currentValue()).toBe("\ngo")
  })

  test("Cmd+Enter is left to the consumer", () => {
    const { field, currentValue } = setup("go /pl")
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })
    expect(currentValue()).toBe("go /pl")
  })

  test("reuses a space that already follows the token", () => {
    const { field, currentValue } = setup("go /pl now")
    fireEvent.keyDown(field, { key: "ArrowLeft" })
    fireEvent.keyDown(field, { key: "ArrowLeft" })
    fireEvent.keyDown(field, { key: "ArrowLeft" })
    fireEvent.keyDown(field, { key: "ArrowLeft" })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(currentValue()).toBe("go /plan now")
  })
})
