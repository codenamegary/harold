import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { StatusPill } from "./StatusPill"

describe("StatusPill", () => {
  test("default variant uses neutral styling", () => {
    const { getByText } = render(<StatusPill>Idle</StatusPill>)

    expect(getByText("Idle")).toHaveClass("bg-panel-elevated")
    expect(getByText("Idle")).toHaveClass("h-5")
  })

  test("success variant uses lime styling", () => {
    const { getByText } = render(<StatusPill variant="success">Online</StatusPill>)

    expect(getByText("Online")).toHaveClass("text-lime")
    expect(getByText("Online")).toHaveClass("bg-lime/10")
  })

  test("violet variant uses violet styling", () => {
    const { getByText } = render(<StatusPill variant="violet">Pairing</StatusPill>)

    expect(getByText("Pairing")).toHaveClass("text-violet-soft")
    expect(getByText("Pairing")).toHaveClass("bg-violet/12")
  })

  test("md size matches icon button height", () => {
    const { getByText } = render(
      <StatusPill size="md" variant="success">
        Online
      </StatusPill>,
    )

    expect(getByText("Online")).toHaveClass("h-8.5")
    expect(getByText("Online")).toHaveClass("items-center")
    expect(getByText("Online")).toHaveClass("justify-center")
  })
})
