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

  test("reads tool result text from rawOutput on tool_call", () => {
    expect(
      parseAcpUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "call_read",
        title: "read",
        kind: "read",
        status: "completed",
        rawInput: null,
        rawOutput: {
          role: "toolResult",
          toolCallId: "call_read",
          toolName: "read",
          content: [{ type: "text", text: "file body" }],
          isError: false,
        },
      }),
    ).toEqual({
      kind: "tool_call",
      toolCallId: "call_read",
      toolName: "read",
      toolKind: "read",
      status: "completed",
      detail: "file body",
    })
  })

  test("reads terminal output from _meta on tool_call_update", () => {
    expect(
      parseAcpUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "call_bash",
        status: "completed",
        _meta: {
          terminal_output: { terminal_id: "call_bash", data: "PLAN.md\napps\n" },
          terminal_exit: { terminal_id: "call_bash", exit_code: 0, signal: null },
        },
      }),
    ).toEqual({
      kind: "tool_call_update",
      toolCallId: "call_bash",
      status: "completed",
      detail: "PLAN.md\napps\n",
    })
  })

  test("reads nested content blocks on tool_call_update", () => {
    expect(
      parseAcpUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "call_edit",
        status: "completed",
        content: [
          { type: "content", content: { type: "text", text: "patch applied" } },
        ],
        rawOutput: {
          role: "toolResult",
          toolCallId: "call_edit",
          content: [{ type: "text", text: "patch applied" }],
        },
      }),
    ).toEqual({
      kind: "tool_call_update",
      toolCallId: "call_edit",
      status: "completed",
      detail: "patch applied",
    })
  })

  test("preserves messageId on chunk updates", () => {
    expect(
      parseAcpUpdate({
        sessionUpdate: "agent_message_chunk",
        messageId: "msg_1",
        content: { type: "text", text: "Hello" },
      }),
    ).toEqual({ kind: "agent_message_chunk", text: "Hello", messageId: "msg_1" })

    expect(
      parseAcpUpdate({
        sessionUpdate: "agent_thought_chunk",
        messageId: "msg_2",
        text: "thinking",
      }),
    ).toEqual({ kind: "agent_thought_chunk", text: "thinking", messageId: "msg_2" })

    expect(
      parseAcpUpdate({
        sessionUpdate: "user_message_chunk",
        messageId: "msg_3",
        content: { type: "text", text: "hi" },
      }),
    ).toEqual({ kind: "user_message_chunk", text: "hi", messageId: "msg_3" })
  })

  test("ignores unknown update kinds", () => {
    expect(parseAcpUpdate({ sessionUpdate: "session_info_update" })).toEqual({
      kind: "ignored",
    })
  })
})
