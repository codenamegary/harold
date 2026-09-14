import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import { ConfigOption } from "contracts/http/config.options"
import { SessionConfigRow } from "./SessionConfigRow"

const selectOption = (
  id: string,
  category: string,
  currentValue: string,
  options: { value: string; name: string }[],
): ConfigOption => ({
  id,
  name: id,
  category,
  type: "select",
  currentValue,
  options,
})

const model = selectOption("model", "model", "openai/gpt-5.2", [
  { value: "opencode/big-pickle", name: "Big Pickle" },
  { value: "openai/gpt-5.2", name: "GPT-5.2" },
])

const mode = selectOption("mode", "mode", "agent", [
  { value: "agent", name: "Agent" },
  { value: "ask", name: "Ask" },
])

const thinking = selectOption("thought_level", "thought_level", "thinking: high", [
  { value: "thinking: low", name: "thinking: low" },
  { value: "thinking: high", name: "thinking: high" },
])

describe("SessionConfigRow", () => {
  test("renders a non-interactive ghost row when there are no options", () => {
    const { container, getByText } = render(
      <SessionConfigRow
        onModelPick={() => undefined}
        onModeCycle={() => undefined}
        onThinkingCycle={() => undefined}
      />,
    )

    expect(getByText("provider/model")).toBeTruthy()
    expect(getByText("mode")).toBeTruthy()
    expect(getByText("thinking")).toBeTruthy()
    expect(container.querySelector("button")).toBeNull()
    expect(container.firstElementChild?.className).toContain("text-dim")
  })

  test("renders the model link, mode toggle, and thinking control", () => {
    const { getByRole } = render(
      <SessionConfigRow
        model={model}
        mode={mode}
        thinking={thinking}
        onModelPick={() => undefined}
        onModeCycle={() => undefined}
        onThinkingCycle={() => undefined}
      />,
    )

    expect(getByRole("button", { name: /Model: GPT-5\.2/ })).toBeTruthy()
    expect(getByRole("button", { name: /Mode: Agent/ })).toBeTruthy()
    expect(getByRole("button", { name: /Thinking: high/ })).toBeTruthy()
  })

  test("shimmers every label while saving and none while idle", () => {
    const saving = render(
      <SessionConfigRow
        model={model}
        mode={mode}
        thinking={thinking}
        saving
        onModelPick={() => undefined}
        onModeCycle={() => undefined}
        onThinkingCycle={() => undefined}
      />,
    )

    const savingLabels = [
      ...saving.getByRole("button", { name: /Model: GPT-5\.2/ }).querySelectorAll("span"),
      saving.getByRole("button", { name: /Mode: Agent/ }),
      ...saving.getByRole("button", { name: /Thinking: high/ }).querySelectorAll("span"),
    ]
    expect(savingLabels.length).toBeGreaterThan(0)
    for (const label of savingLabels) {
      expect(label.className).toContain("config-saving-label")
    }

    saving.unmount()

    const idle = render(
      <SessionConfigRow
        model={model}
        mode={mode}
        thinking={thinking}
        onModelPick={() => undefined}
        onModeCycle={() => undefined}
        onThinkingCycle={() => undefined}
      />,
    )

    const idleLabels = [
      ...idle.getByRole("button", { name: /Model: GPT-5\.2/ }).querySelectorAll("span"),
      idle.getByRole("button", { name: /Mode: Agent/ }),
      ...idle.getByRole("button", { name: /Thinking: high/ }).querySelectorAll("span"),
    ]
    for (const label of idleLabels) {
      expect(label.className).not.toContain("config-saving-label")
    }
  })

  test("opens the model popover and reports the picked value", () => {
    const picked: string[] = []
    const { getByRole } = render(
      <SessionConfigRow
        model={model}
        onModelPick={(value) => {
          picked.push(value)
        }}
        onModeCycle={() => undefined}
        onThinkingCycle={() => undefined}
      />,
    )

    fireEvent.click(getByRole("button", { name: /Model: GPT-5\.2/ }))
    fireEvent.click(getByRole("option", { name: /Big Pickle/ }))

    expect(picked).toEqual(["opencode/big-pickle"])
  })

  test("cycles the mode to the next value", () => {
    const cycled: string[] = []
    const { getByRole } = render(
      <SessionConfigRow
        model={model}
        mode={mode}
        onModelPick={() => undefined}
        onModeCycle={(next) => {
          cycled.push(next.value)
        }}
        onThinkingCycle={() => undefined}
      />,
    )

    fireEvent.click(getByRole("button", { name: /Mode: Agent/ }))

    expect(cycled).toEqual(["ask"])
  })

  test("cycles the thinking level to the next value", () => {
    const cycled: string[] = []
    const { getByRole } = render(
      <SessionConfigRow
        model={model}
        thinking={thinking}
        onModelPick={() => undefined}
        onModeCycle={() => undefined}
        onThinkingCycle={(next) => {
          cycled.push(next.value)
        }}
      />,
    )

    fireEvent.click(getByRole("button", { name: /Thinking: high/ }))

    expect(cycled).toEqual(["thinking: low"])
  })

  test("omits controls for missing options", () => {
    const { queryByRole } = render(
      <SessionConfigRow
        mode={mode}
        onModelPick={() => undefined}
        onModeCycle={() => undefined}
        onThinkingCycle={() => undefined}
      />,
    )

    expect(queryByRole("button", { name: /Model:/ })).toBeNull()
    expect(queryByRole("button", { name: /Thinking:/ })).toBeNull()
    expect(queryByRole("button", { name: /Mode: Agent/ })).toBeTruthy()
  })
})

