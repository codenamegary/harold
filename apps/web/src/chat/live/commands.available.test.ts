import { describe, expect, test } from "bun:test"
import { parseAvailableCommands } from "./commands.available"

describe("parseAvailableCommands", () => {
  test("reads names, descriptions, and input hints", () => {
    expect(
      parseAvailableCommands({
        sessionUpdate: "available_commands_update",
        availableCommands: [
          { name: "plan", description: "Draft a plan" },
          { name: "test", description: "Run tests", input: { hint: "[path]" } },
        ],
      }),
    ).toEqual([
      { name: "plan", description: "Draft a plan" },
      { name: "test", description: "Run tests", hint: "[path]" },
    ])
  })

  test("reads an empty list as an empty list, not a miss", () => {
    expect(
      parseAvailableCommands({
        sessionUpdate: "available_commands_update",
        availableCommands: [],
      }),
    ).toEqual([])
  })

  test("returns null for other update kinds", () => {
    expect(
      parseAvailableCommands({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      }),
    ).toBeNull()
  })

  test("returns null when a command has no name", () => {
    expect(
      parseAvailableCommands({
        sessionUpdate: "available_commands_update",
        availableCommands: [{ description: "no name" }],
      }),
    ).toBeNull()
  })
})
