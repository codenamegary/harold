import { describe, expect, test } from "bun:test"
import { cursorAgentProfile } from "../agent-profile"
import { buildAgentSpawnCommand } from "./spawn-agent-process"

describe("buildAgentSpawnCommand", () => {
  test("replaces the binary name with the resolved executable path", () => {
    expect(buildAgentSpawnCommand(cursorAgentProfile, "/opt/cursor/bin/agent")).toEqual([
      "/opt/cursor/bin/agent",
      "acp",
    ])
  })
})
