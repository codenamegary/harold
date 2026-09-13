import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"
import { ModelLink, ModelPopover } from "./ModelPopover"

const modelOption = (currentValue: string): ConfigOption => ({
  id: "model",
  name: "Model",
  category: "model",
  type: "select",
  currentValue,
  options: [
    { value: "opencode/big-pickle", name: "Big Pickle" },
    { value: "openai/gpt-5.2", name: "GPT-5.2", description: "Flagship model" },
    { value: "anthropic/claude-4", name: "Claude 4" },
  ],
})

const toValues = (option: ConfigOption): ConfigOptionValue[] =>
  option.type === "select" ? option.options : []

describe("ModelLink", () => {
  test("shows the current model name and opens on press", () => {
    const picked: boolean[] = []
    const { getByRole } = render(
      <ModelLink
        option={modelOption("openai/gpt-5.2")}
        onPick={() => {
          picked.push(true)
        }}
      />,
    )

    const link = getByRole("button", { name: /Model: GPT-5\.2/ })
    expect(link.textContent).toContain("GPT-5.2")

    fireEvent.click(link)
    expect(picked).toEqual([true])
  })

  test("falls back to the raw value when the current value has no name", () => {
    const option: ConfigOption = {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "opaque-id[effort=high]",
      options: [{ value: "opaque-id[effort=high]", name: "Opaque" }],
    }
    const { getByRole } = render(
      <ModelLink option={option} onPick={() => undefined} />,
    )

    expect(getByRole("button", { name: /Model:/ }).textContent).toContain("Opaque")
  })
})

describe("ModelPopover", () => {
  test("lists options, tints the current value, and picks on click", () => {
    const picked: string[] = []
    const closed: boolean[] = []
    const option = modelOption("openai/gpt-5.2")

    const { getByRole } = render(
      <ModelPopover
        open
        options={toValues(option)}
        currentValue="openai/gpt-5.2"
        onPick={(value) => {
          picked.push(value)
        }}
        onClose={() => {
          closed.push(true)
        }}
      />,
    )

    const current = getByRole("option", { name: /GPT-5\.2/ })
    expect(current.getAttribute("aria-selected")).toBe("true")

    fireEvent.click(getByRole("option", { name: /Big Pickle/ }))

    expect(picked).toEqual(["opencode/big-pickle"])
    expect(closed).toEqual([true])
  })

  test("filters by substring on name and value when a query is typed", async () => {
    const user = userEvent.setup()
    const filler = Array.from({ length: 25 }, (_, index) => ({
      value: `vendor/filler-${index}`,
      name: `Filler ${index}`,
    }))
    const options = [
      { value: "opencode/big-pickle", name: "Big Pickle" },
      { value: "openai/gpt-5.2", name: "GPT-5.2" },
      { value: "anthropic/claude-4", name: "Claude 4" },
      ...filler,
    ]
    const { getByPlaceholderText, queryByRole, getByRole } = render(
      <ModelPopover
        open
        options={options}
        currentValue="openai/gpt-5.2"
        onPick={() => undefined}
        onClose={() => undefined}
      />,
    )

    const input = getByPlaceholderText("Filter models")
    await user.type(input, "pickle")

    expect(getByRole("option", { name: /Big Pickle/ })).toBeTruthy()
    // The current value is always pinned to the top, even when filtered out.
    expect(getByRole("option", { name: /GPT-5\.2/ })).toBeTruthy()

    await user.clear(input)
    await user.type(input, "anthropic")
    expect(getByRole("option", { name: /Claude 4/ })).toBeTruthy()
    expect(queryByRole("option", { name: /Big Pickle/ })).toBeNull()
  })

  test("always shows the current option first", () => {
    const option = modelOption("anthropic/claude-4")
    const { getAllByRole } = render(
      <ModelPopover
        open
        options={toValues(option)}
        currentValue="anthropic/claude-4"
        onPick={() => undefined}
        onClose={() => undefined}
      />,
    )

    const rendered = getAllByRole("option")
    expect(rendered[0].textContent).toContain("Claude 4")
    // The current option is not duplicated in the remainder of the list.
    const claudeMatches = rendered.filter((node) =>
      node.textContent?.includes("Claude 4"),
    )
    expect(claudeMatches).toHaveLength(1)
  })

  test("keeps the current option first when it matches the filter", async () => {
    const user = userEvent.setup()
    const filler = Array.from({ length: 25 }, (_, index) => ({
      value: `vendor/filler-${index}`,
      name: `Filler ${index}`,
    }))
    const options = [
      { value: "opencode/big-pickle", name: "Big Pickle" },
      { value: "openai/gpt-5.2", name: "GPT-5.2" },
      { value: "anthropic/claude-4", name: "Claude 4" },
      ...filler,
    ]
    const { getByPlaceholderText, getAllByRole } = render(
      <ModelPopover
        open
        options={options}
        currentValue="openai/gpt-5.2"
        onPick={() => undefined}
        onClose={() => undefined}
      />,
    )

    const input = getByPlaceholderText("Filter models")
    await user.type(input, "gpt")

    expect(getAllByRole("option")[0].textContent).toContain("GPT-5.2")
  })

  test("no filter input for short lists", () => {
    const option = modelOption("openai/gpt-5.2")
    const { queryByPlaceholderText } = render(
      <ModelPopover
        open
        options={toValues(option)}
        currentValue="openai/gpt-5.2"
        onPick={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(queryByPlaceholderText("Filter models")).toBeNull()
  })

  test("Escape closes without picking", () => {
    const picked: string[] = []
    const closed: boolean[] = []
    const option = modelOption("openai/gpt-5.2")
    const { getByRole } = render(
      <ModelPopover
        open
        options={toValues(option)}
        currentValue="openai/gpt-5.2"
        onPick={(value) => {
          picked.push(value)
        }}
        onClose={() => {
          closed.push(true)
        }}
      />,
    )

    fireEvent.keyDown(getByRole("listbox", { name: "Model options" }), { key: "Escape" })

    expect(picked).toEqual([])
    expect(closed).toEqual([true])
  })

  test("Escape anywhere in the document closes without picking", () => {
    const picked: string[] = []
    const closed: boolean[] = []
    const option = modelOption("openai/gpt-5.2")
    render(
      <ModelPopover
        open
        options={toValues(option)}
        currentValue="openai/gpt-5.2"
        onPick={(value) => {
          picked.push(value)
        }}
        onClose={() => {
          closed.push(true)
        }}
      />,
    )

    // Fire on the document, i.e. focus is not inside the popover.
    fireEvent.keyDown(document, { key: "Escape" })

    expect(picked).toEqual([])
    expect(closed).toEqual([true])
  })

  test("removes the document Escape listener when closed", () => {
    const closed: boolean[] = []
    const { unmount } = render(
      <ModelPopover
        open
        options={toValues(modelOption("openai/gpt-5.2"))}
        currentValue="openai/gpt-5.2"
        onPick={() => undefined}
        onClose={() => {
          closed.push(true)
        }}
      />,
    )

    unmount()
    fireEvent.keyDown(document, { key: "Escape" })

    expect(closed).toEqual([])
  })

  test("the close button closes without picking", () => {
    const picked: string[] = []
    const closed: boolean[] = []
    const option = modelOption("openai/gpt-5.2")
    const { getByRole } = render(
      <ModelPopover
        open
        options={toValues(option)}
        currentValue="openai/gpt-5.2"
        onPick={(value) => {
          picked.push(value)
        }}
        onClose={() => {
          closed.push(true)
        }}
      />,
    )

    fireEvent.click(getByRole("button", { name: "Close model list" }))

    expect(picked).toEqual([])
    expect(closed).toEqual([true])
  })

  test("Enter picks the highlighted option", () => {
    const picked: string[] = []
    const option = modelOption("openai/gpt-5.2")
    const { getByRole } = render(
      <ModelPopover
        open
        options={toValues(option)}
        currentValue="opencode/big-pickle"
        onPick={(value) => {
          picked.push(value)
        }}
        onClose={() => undefined}
      />,
    )

    fireEvent.keyDown(getByRole("listbox", { name: "Model options" }), { key: "Enter" })

    expect(picked).toEqual(["opencode/big-pickle"])
  })

  test("renders nothing when closed", () => {
    const { queryByRole } = render(
      <ModelPopover
        open={false}
        options={toValues(modelOption("openai/gpt-5.2"))}
        currentValue="openai/gpt-5.2"
        onPick={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(queryByRole("listbox", { name: "Model options" })).toBeNull()
  })
})
