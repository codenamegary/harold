import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  ZAI_CODING_PLAN_BASE_URL,
  openCodeSmokeConfigContent,
  writeOpenCodeSmokeConfig,
} from "./smoke.gate"

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

describe("writeOpenCodeSmokeConfig", () => {
  test("writes the config into the session cwd because ACP ignores the env override", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "harold-smoke-config-"))
    try {
      await writeOpenCodeSmokeConfig(directory, "zai-coding-plan/glm-5.3-flash")

      const written = await readFile(path.join(directory, "opencode.json"), "utf8")
      expect(written).toBe(openCodeSmokeConfigContent("zai-coding-plan/glm-5.3-flash"))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
