import { describe, expect, test } from "bun:test"
import { deriveSessionNameFromPrompt } from "./derive.session.name"

describe("deriveSessionNameFromPrompt", () => {
  test("returns trimmed prompt when under max length", () => {
    expect(deriveSessionNameFromPrompt("  Explain auth  ")).toBe("Explain auth")
  })

  test("truncates to 120 characters", () => {
    const text = "a".repeat(150)
    expect(deriveSessionNameFromPrompt(text)).toBe("a".repeat(120))
  })
})
