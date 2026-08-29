import { describe, expect, test } from "bun:test"
import { parseAvailableCommandsUpdate } from "./commands.available"

const commandsUpdate = {
  sessionUpdate: "available_commands_update",
  availableCommands: [
    {
      name: "web",
      description: "Search the web",
      input: { hint: "query" },
    },
    {
      name: "test",
      description: "Run tests",
    },
  ],
}

describe("parseAvailableCommandsUpdate", () => {
  test("returns the original payload for a valid commands update", () => {
    expect(parseAvailableCommandsUpdate(commandsUpdate)).toEqual(commandsUpdate)
  })

  test("returns null for other session updates", () => {
    expect(
      parseAvailableCommandsUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hi" },
      }),
    ).toBeNull()
  })

  test("returns null when name is missing", () => {
    expect(
      parseAvailableCommandsUpdate({
        sessionUpdate: "available_commands_update",
        availableCommands: [{ description: "no name" }],
      }),
    ).toBeNull()
  })
})
