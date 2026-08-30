import { describe, expect, test } from "bun:test"
import { overlayAnchor } from "./prompt.input.overlay.anchor"

describe("overlayAnchor", () => {
  test("sits above the token span, not the host top", () => {
    expect(
      overlayAnchor(
        { left: 10, top: 0, bottom: 100 },
        { left: 40, top: 60, bottom: 76 },
        6,
      ),
    ).toEqual({ left: 30, bottom: 46 })
  })

  test("tracks a span on the first line", () => {
    expect(
      overlayAnchor(
        { left: 0, top: 0, bottom: 88 },
        { left: 12, top: 8, bottom: 24 },
        6,
      ),
    ).toEqual({ left: 12, bottom: 86 })
  })
})
