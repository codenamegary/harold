import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { MetricCard } from "./MetricCard"

describe("MetricCard", () => {
  test("renders metric card container", () => {
    const { getByText } = render(
      <MetricCard>
        <span>Active sessions</span>
      </MetricCard>,
    )

    const card = getByText("Active sessions").parentElement
    expect(card).toHaveClass("min-h-[155px]")
    expect(card).toHaveClass("border-line-soft")
  })

  test("lime accent adds accent class", () => {
    const { getByText } = render(
      <MetricCard accent="lime">
        <span>Sessions</span>
      </MetricCard>,
    )

    expect(getByText("Sessions").parentElement).toHaveClass("after:bg-lime/5")
  })

  test("violet accent adds accent class", () => {
    const { getByText } = render(
      <MetricCard accent="violet">
        <span>Agents</span>
      </MetricCard>,
    )

    expect(getByText("Agents").parentElement).toHaveClass("after:bg-violet/6")
  })
})
