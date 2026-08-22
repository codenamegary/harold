import { describe, expect, test } from "bun:test"
import { defaultClientCapabilities } from "../catalog/agent.profile.override"
import { AgentProfile } from "../agent-profile"
import { buildAgentSpawnCommand, spawnAgentProcess } from "./spawn.agent.process"

const cursorProfile: AgentProfile = {
  id: "cursor",
  command: ["agent"],
  authMethodId: "cursor_login",
  clientCapabilities: defaultClientCapabilities,
}

const waitForLine = async (lines: readonly string[], expected: string): Promise<void> => {
  const startedAt = Date.now()
  const poll = async (): Promise<void> => {
    if (lines.includes(expected)) {
      return
    }
    if (Date.now() - startedAt > 2000) {
      throw new Error(`timed out waiting for stderr line: ${expected}`)
    }
    await Bun.sleep(10)
    return poll()
  }
  return poll()
}

describe("buildAgentSpawnCommand", () => {
  test("prefixes the executable path onto args", () => {
    expect(buildAgentSpawnCommand("/opt/cursor/bin/agent", ["acp"])).toEqual([
      "/opt/cursor/bin/agent",
      "acp",
    ])
  })
})

describe("spawnAgentProcess", () => {
  test("emits stderr lines to onStderrLine", async () => {
    const lines: string[] = []
    const spawned = spawnAgentProcess({
      profile: cursorProfile,
      executablePath: "/bin/sh",
      args: ["-c", "echo cursor-stderr-probe >&2"],
      onStderrLine: (line) => {
        lines.push(line)
      },
    })

    await waitForLine(lines, "cursor-stderr-probe")
    await spawned.waitForExit()
    expect(lines).toContain("cursor-stderr-probe")
  })
})
