import { describe, expect, test } from "bun:test"
import { buildAgentSpawnCommand } from "./spawn-agent-process"

describe("buildAgentSpawnCommand", () => {
  test("prefixes the executable path onto args", () => {
    expect(buildAgentSpawnCommand("/opt/cursor/bin/agent", ["acp"])).toEqual([
      "/opt/cursor/bin/agent",
      "acp",
    ])
  })
})
