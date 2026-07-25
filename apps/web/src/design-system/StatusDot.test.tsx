import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { StatusDot } from "./StatusDot"

describe("StatusDot", () => {
  test("online variant uses lime", () => {
    const { getByLabelText } = render(<StatusDot variant="online" />)

    expect(getByLabelText("online status")).toHaveClass("bg-lime")
  })

  test("warning variant uses amber", () => {
    const { getByLabelText } = render(<StatusDot variant="warning" />)

    expect(getByLabelText("warning status")).toHaveClass("bg-[#f4bc5f]")
  })

  test("offline variant uses muted gray", () => {
    const { getByLabelText } = render(<StatusDot variant="offline" />)

    expect(getByLabelText("offline status")).toHaveClass("bg-[#505866]")
  })
})
