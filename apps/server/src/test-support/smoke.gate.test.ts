import { describe, expect, test } from "bun:test"
import { ZAI_CODING_PLAN_BASE_URL, openCodeSmokeConfigContent } from "./smoke.gate"

describe("openCodeSmokeConfigContent", () => {
  test("pins the z.ai coding plan endpoint so live catalog drift cannot reroute smoke models", () => {
    const parsed = JSON.parse(openCodeSmokeConfigContent("zai-coding-plan/glm-5.3-flash")) as {
      model: string
      provider: { "zai-coding-plan": { options: { baseURL: string } } }
    }
    expect(parsed.model).toBe("zai-coding-plan/glm-5.3-flash")
    expect(parsed.provider["zai-coding-plan"].options.baseURL).toBe(ZAI_CODING_PLAN_BASE_URL)
  })

  test("keeps the coding plan endpoint on api.z.ai", () => {
    expect(ZAI_CODING_PLAN_BASE_URL).toBe("https://api.z.ai/api/coding/paas/v4")
  })
})
