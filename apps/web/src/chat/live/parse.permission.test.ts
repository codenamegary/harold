import { describe, expect, test } from "bun:test"
import { parseStreamPermission } from "./parse.permission"

describe("parseStreamPermission", () => {
  test("reads ACP permission options and tool name", () => {
    expect(
      parseStreamPermission({
        requestId: "req-1",
        params: {
          sessionId: "acp-1",
          options: [
            { optionId: "allow-once", name: "Allow once" },
            { optionId: "reject-once", name: "Reject" },
          ],
          toolCall: { toolCallId: "t1", name: "edit" },
        },
      }),
    ).toEqual({
      requestId: "req-1",
      toolName: "edit",
      options: [
        { optionId: "allow-once", name: "Allow once" },
        { optionId: "reject-once", name: "Reject" },
      ],
    })
  })

  test("returns null when options are missing", () => {
    expect(
      parseStreamPermission({
        requestId: "req-1",
        params: { sessionId: "acp-1" },
      }),
    ).toBeNull()
  })
})
