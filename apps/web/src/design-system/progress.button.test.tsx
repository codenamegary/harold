import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"
import { ProgressButton } from "./ProgressButton"

const thinkingOption = (currentValue: string): ConfigOption => ({
  id: "thought_level",
  name: "Thinking",
  category: "thought_level",
  type: "select",
  currentValue,
  options: [
    { value: "off", name: "Off" },
    { value: "low", name: "Low" },
    { value: "medium", name: "Medium" },
    { value: "high", name: "High" },
  ],
})

const renderProgress = (props: {
  option?: ConfigOption
  disabled?: boolean
  onCycle?: (value: string) => void
  label?: string
}) =>
  render(
    <ProgressButton
      option={props.option ?? thinkingOption("off")}
      disabled={props.disabled}
      onCycle={props.onCycle ?? (() => undefined)}
      fillClassName="bg-lime"
      aria-label="Thinking control"
    >
      {props.label ?? "Off"}
    </ProgressButton>,
  )

describe("ProgressButton", () => {
  test("one press advances one level and wraps", () => {
    const seen: ConfigOptionValue[] = []
    const { getByRole } = renderProgress({
      onCycle: (value) => {
        seen.push(value)
      },
    })

    fireEvent.click(getByRole("button", { name: "Thinking control" }))

    expect(seen).toEqual([thinkingOption("off").options[1]])
  })

  test("the underline encodes the cycle position", () => {
    const { getByRole, rerender } = render(
      <ProgressButton
        option={thinkingOption("off")}
        onCycle={() => undefined}
        fillClassName="bg-lime"
        aria-label="Thinking control"
      >
        Off
      </ProgressButton>,
    )

    const underline = () =>
      getByRole("button", { name: "Thinking control" }).querySelector("[data-underline]")

    expect(underline()?.getAttribute("data-underline")).toBe("0")

    rerender(
      <ProgressButton
        option={thinkingOption("low")}
        onCycle={() => undefined}
        fillClassName="bg-lime"
        aria-label="Thinking control"
      >
        Low
      </ProgressButton>,
    )
    expect(underline()?.getAttribute("data-underline")).toBe("33")

    rerender(
      <ProgressButton
        option={thinkingOption("high")}
        onCycle={() => undefined}
        fillClassName="bg-lime"
        aria-label="Thinking control"
      >
        High
      </ProgressButton>,
    )
    expect(underline()?.getAttribute("data-underline")).toBe("100")
  })

  test("a single-level option renders with no underline and no cycle", () => {
    const seen: string[] = []
    const option: ConfigOption = {
      id: "thought_level",
      name: "Thinking",
      category: "thought_level",
      type: "select",
      currentValue: "fixed",
      options: [{ value: "fixed", name: "Fixed" }],
    }
    const { getByRole } = render(
      <ProgressButton
        option={option}
        onCycle={(value) => {
          seen.push(value)
        }}
        fillClassName="bg-lime"
        aria-label="Thinking control"
      >
        Fixed
      </ProgressButton>,
    )

    fireEvent.click(getByRole("button", { name: "Thinking control" }))

    expect(seen).toEqual([])
    expect(
      getByRole("button", { name: "Thinking control" }).querySelector("[data-underline]")
        ?.getAttribute("data-underline"),
    ).toBe("0")
  })

  test("disabled presses do not cycle", () => {
    const seen: string[] = []
    const { getByRole } = renderProgress({
      disabled: true,
      onCycle: (value) => {
        seen.push(value)
      },
    })

    fireEvent.click(getByRole("button", { name: "Thinking control" }))

    expect(seen).toEqual([])
  })
})
