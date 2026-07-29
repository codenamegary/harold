import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { SectionKicker } from "./SectionKicker"

describe("SectionKicker", () => {
  test("renders uppercase mono kicker", () => {
    const { getByText } = render(<SectionKicker>Live activity</SectionKicker>)

    const kicker = getByText("Live activity")
    expect(kicker).toHaveClass("font-mono")
    expect(kicker).toHaveClass("uppercase")
    expect(kicker).toHaveClass("text-lime")
  })
})
