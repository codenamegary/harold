import { describe, expect, test } from "bun:test"
import { resolveAgentProfile } from "../agent-profile"
import { buildAgentSpawnCommand } from "./spawn-agent-process"

describe("buildAgentSpawnCommand", () => {
  test("replaces the binary name with the resolved executable path", () => {
    const profile = resolveAgentProfile("cursor")
    if (profile === undefined) {
      throw new Error("expected cursor profile")
    }

    expect(buildAgentSpawnCommand(profile, "/opt/cursor/bin/agent")).toEqual([
      "/opt/cursor/bin/agent",
      "acp",
    ])
  })
})
