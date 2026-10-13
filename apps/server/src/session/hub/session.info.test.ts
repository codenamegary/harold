import { describe, expect, test } from "bun:test"
import { parseSessionInfoUpdate } from "./session.info"

const titledUpdate = {
  sessionUpdate: "session_info_update",
  title: "Fix the auth flow",
}

describe("parseSessionInfoUpdate", () => {
  test("returns the original payload for a valid title update", () => {
    expect(parseSessionInfoUpdate(titledUpdate)).toEqual(titledUpdate)
  })

  test("returns the payload when the agent clears the title", () => {
    const cleared = { sessionUpdate: "session_info_update", title: null }

    expect(parseSessionInfoUpdate(cleared)).toEqual(cleared)
  })

  test("returns the payload for a marker update without a title", () => {
    const marker = {
      sessionUpdate: "session_info_update",
      _meta: { opencode: { marker: "retry" } },
    }

    expect(parseSessionInfoUpdate(marker)).toEqual(marker)
  })

  test("returns null for other session updates", () => {
    expect(
      parseSessionInfoUpdate({
        sessionUpdate: "available_commands_update",
        availableCommands: [],
      }),
    ).toBeNull()
  })

  test("returns null when the title has the wrong shape", () => {
    expect(
      parseSessionInfoUpdate({
        sessionUpdate: "session_info_update",
        title: 42,
      }),
    ).toBeNull()
  })
})
