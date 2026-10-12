import { describe, expect, test } from "bun:test"
import { openCodeSmokeConfigContent } from "./smoke.gate"

describe("openCodeSmokeConfigContent", () => {
  test("pins the zen endpoint so the live catalog cannot send free models to /inference/v1", () => {
    const parsed = JSON.parse(openCodeSmokeConfigContent("opencode/mimo-v2.5-free")) as {
      model: string
      provider: { opencode: { options: { baseURL: string } } }
    }
    expect(parsed.model).toBe("opencode/mimo-v2.5-free")
    expect(parsed.provider.opencode.options.baseURL).toBe("https://opencode.ai/zen/v1")
  })
})
