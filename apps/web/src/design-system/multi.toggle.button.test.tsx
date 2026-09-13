import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"
import { MultiToggleButton } from "./MultiToggleButton"

const modeOption = (currentValue: string): ConfigOption => ({
  id: "mode",
  name: "Mode",
  category: "mode",
  type: "select",
  currentValue,
  options: [
    { value: "agent", name: "Agent" },
    { value: "ask", name: "Ask" },
    { value: "edit", name: "Edit" },
  ],
})

const renderToggle = (props: {
  option?: ConfigOption
  colorClassName?: (value: string) => string | undefined
  disabled?: boolean
  onCycle?: (value: string) => void
  label?: string
}) =>
  render(
    <MultiToggleButton
      option={props.option ?? modeOption("agent")}
      colorClassName={props.colorClassName}
      disabled={props.disabled}
      onCycle={props.onCycle ?? (() => undefined)}
      aria-label="Mode control"
    >
      {props.label ?? "Agent"}
    </MultiToggleButton>,
  )

describe("MultiToggleButton", () => {
  test("one press advances one value in option order and wraps", () => {
    const seen: ConfigOptionValue[] = []
    const { getByRole } = renderToggle({
      onCycle: (value) => {
        seen.push(value)
      },
      label: "Agent",
    })

    const option = modeOption("agent")
    fireEvent.click(getByRole("button", { name: "Mode control" }))

    expect(seen).toEqual([option.options[1]])
  })

  test("pressing on the last value wraps to the first", () => {
    const seen: ConfigOptionValue[] = []
    const { getByRole } = renderToggle({
      option: modeOption("edit"),
      onCycle: (value) => {
        seen.push(value)
      },
    })

    fireEvent.click(getByRole("button", { name: "Mode control" }))

    expect(seen).toEqual([modeOption("edit").options[0]])
  })

  test("a single-option press is a no-op without calling onCycle", () => {
    const seen: string[] = []
    const option: ConfigOption = {
      id: "mode",
      name: "Mode",
      category: "mode",
      type: "select",
      currentValue: "only",
      options: [{ value: "only", name: "Only" }],
    }
    const { getByRole } = renderToggle({
      option,
      onCycle: (value) => {
        seen.push(value)
      },
    })

    fireEvent.click(getByRole("button", { name: "Mode control" }))

    expect(seen).toEqual([])
  })

  test("the wrapper carries the color class for the current value", () => {
    const { getByRole } = renderToggle({
      colorClassName: (value) => (value === "agent" ? "text-mode-agent" : undefined),
    })

    expect(getByRole("button", { name: "Mode control" }).className).toContain("text-mode-agent")
  })

  test("an unknown value renders without a color class", () => {
    const { getByRole } = renderToggle({
      option: modeOption("mystery"),
      colorClassName: () => undefined,
    })

    expect(getByRole("button", { name: "Mode control" }).className).not.toContain("text-mode-agent")
  })

  test("disabled presses do not cycle", () => {
    const seen: string[] = []
    const { getByRole } = renderToggle({
      disabled: true,
      onCycle: (value) => {
        seen.push(value)
      },
    })

    fireEvent.click(getByRole("button", { name: "Mode control" }))

    expect(seen).toEqual([])
  })
})
