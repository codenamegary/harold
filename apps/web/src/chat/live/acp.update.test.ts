import { describe, expect, test } from "bun:test"
import { parseAcpUpdate } from "./acp.update"

describe("parseAcpUpdate", () => {
  test("reads nested agent_message_chunk text", () => {
    expect(
      parseAcpUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      }),
    ).toEqual({ kind: "agent_message_chunk", text: "Hello" })
  })

  test("reads flat agent_thought_chunk text", () => {
    expect(
      parseAcpUpdate({
        sessionUpdate: "agent_thought_chunk",
        text: "thinking",
      }),
    ).toEqual({ kind: "agent_thought_chunk", text: "thinking" })
  })

  test("reads tool_call and tool_call_update", () => {
    expect(
      parseAcpUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "read_file",
        kind: "read",
        status: "pending",
      }),
    ).toEqual({
      kind: "tool_call",
      toolCallId: "tool-1",
      toolName: "read_file",
      toolKind: "read",
      status: "pending",
    })

    expect(
      parseAcpUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        status: "completed",
      }),
    ).toEqual({
      kind: "tool_call_update",
      toolCallId: "tool-1",
      status: "completed",
    })
  })

  test("ignores unknown update kinds", () => {
    expect(parseAcpUpdate({ sessionUpdate: "session_info_update" })).toEqual({
      kind: "ignored",
    })
  })
})
