import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { StatusPill } from "./StatusPill"

describe("StatusPill", () => {
  test("default variant uses neutral styling", () => {
    const { getByText } = render(<StatusPill>Idle</StatusPill>)

    expect(getByText("Idle")).toHaveClass("bg-[#181d25]")
  })

  test("success variant uses lime styling", () => {
    const { getByText } = render(<StatusPill variant="success">Online</StatusPill>)

    expect(getByText("Online")).toHaveClass("text-lime")
    expect(getByText("Online")).toHaveClass("bg-lime/10")
  })

  test("violet variant uses violet styling", () => {
    const { getByText } = render(<StatusPill variant="violet">Pairing</StatusPill>)

    expect(getByText("Pairing")).toHaveClass("text-[#c0b6ff]")
    expect(getByText("Pairing")).toHaveClass("bg-violet/12")
  })
})
