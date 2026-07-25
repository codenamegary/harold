import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { Panel } from "./Panel"

describe("Panel", () => {
  test("renders bordered panel container", () => {
    const { container } = render(<Panel>Workspace list</Panel>)

    expect(container.firstChild).toHaveClass("bg-panel")
    expect(container.firstChild).toHaveClass("border")
    expect(container.firstChild).toHaveClass("border-[#1a1f28]")
  })
})
