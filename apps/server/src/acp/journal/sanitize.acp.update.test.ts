import { describe, expect, test } from "bun:test"
import { JournalAppendRecordSchema } from "contracts/events/journal-record"
import {
  sanitizeOperatorPromptText,
  sanitizeSessionUpdate,
  shouldJournalAcpMethod,
} from "./sanitize.acp.update"

describe("sanitizeSessionUpdate", () => {
  test("maps contract-shaped agent_message_chunk", () => {
    expect(sanitizeSessionUpdate({ updateKind: "agent_message_chunk", text: "hi" })).toEqual({
      updateKind: "agent_message_chunk",
      text: "hi",
    })
  })

  test("maps wire-shaped sessionUpdate agent_message_chunk", () => {
    expect(
      sanitizeSessionUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      }),
    ).toEqual({
      updateKind: "agent_message_chunk",
      text: "Hello",
    })
  })

  test("maps legacy fake-acp kind/content shape", () => {
    expect(sanitizeSessionUpdate({ kind: "agent_message_chunk", content: "legacy" })).toEqual({
      updateKind: "agent_message_chunk",
      text: "legacy",
    })
  })

  test("maps Cursor sessionUpdate with nested content text", () => {
    expect(
      sanitizeSessionUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "wire text" },
      }),
    ).toEqual({
      updateKind: "agent_message_chunk",
      text: "wire text",
    })
  })

  test("maps agent_thought_chunk with nested content text", () => {
    expect(
      sanitizeSessionUpdate({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "thinking" },
      }),
    ).toEqual({
      updateKind: "agent_thought_chunk",
      text: "thinking",
    })
  })

  test("maps flat agent_thought_chunk text", () => {
    expect(
      sanitizeSessionUpdate({
        updateKind: "agent_thought_chunk",
        text: "flat thought",
      }),
    ).toEqual({
      updateKind: "agent_thought_chunk",
      text: "flat thought",
    })
  })

  test("redacts user_message_chunk to kind only", () => {
    expect(
      sanitizeSessionUpdate({
        updateKind: "user_message_chunk",
        text: "secret prompt",
      }),
    ).toEqual({ updateKind: "user_message_chunk" })
  })

  test("maps unknown kinds to safe metadata", () => {
    expect(sanitizeSessionUpdate({ updateKind: "thought", content: "hidden" })).toEqual({
      updateKind: "unknown",
      sourceKind: "thought",
    })
  })

  test("keeps status-only tool_call_update without tool name", () => {
    expect(
      sanitizeSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "call_001",
        status: "completed",
      }),
    ).toEqual({
      updateKind: "tool_call_update",
      toolCallId: "call_001",
      status: "completed",
    })
  })

  test("maps tool_call_update with title and status", () => {
    expect(
      sanitizeSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "call_001",
        title: "Reading file",
        kind: "read",
        status: "in_progress",
      }),
    ).toEqual({
      updateKind: "tool_call_update",
      toolCallId: "call_001",
      toolName: "Reading file",
      toolKind: "read",
      status: "in_progress",
    })
  })

  test("captures locations and rawInput as tool detail", () => {
    expect(
      sanitizeSessionUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "call_001",
        title: "Read File",
        kind: "read",
        status: "pending",
        locations: [{ path: "/home/codenamegary/sites/griddy/README.md", line: 1 }],
        rawInput: { path: "/home/codenamegary/sites/griddy/README.md" },
      }),
    ).toEqual({
      updateKind: "tool_call",
      toolCallId: "call_001",
      toolName: "Read File",
      toolKind: "read",
      status: "pending",
      detail:
        "/home/codenamegary/sites/griddy/README.md:1\npath: /home/codenamegary/sites/griddy/README.md",
    })
  })

  test("rejects payloads with extra secret fields at journal boundary", () => {
    const payload = sanitizeSessionUpdate({ updateKind: "agent_message_chunk", text: "ok" })
    expect(() =>
      JournalAppendRecordSchema.parse({
        schemaVersion: 1,
        kind: "acp.notification",
        occurredAt: "2026-07-24T12:00:00.000Z",
        workspaceId: "ws-1",
        sessionId: "sess-1",
        protocolVersion: 1,
        direction: "agent_to_agent_server",
        phase: "live",
        payload: { ...payload, rawPrompt: "secret" },
      }),
    ).toThrow()
  })
})

describe("sanitizeOperatorPromptText", () => {
  test("joins text content blocks", () => {
    expect(
      sanitizeOperatorPromptText([
        { type: "text", text: "hello " },
        { type: "text", text: "world" },
      ]),
    ).toBe("hello world")
  })

  test("skips non-text blocks and non-arrays", () => {
    expect(
      sanitizeOperatorPromptText([
        { type: "image", data: "secret" },
        { type: "text", text: "kept" },
      ]),
    ).toBe("kept")
    expect(sanitizeOperatorPromptText(undefined)).toBe("")
    expect(sanitizeOperatorPromptText("raw")).toBe("")
  })
})

describe("shouldJournalAcpMethod", () => {
  test("excludes initialize and authenticate", () => {
    expect(shouldJournalAcpMethod("initialize")).toBe(false)
    expect(shouldJournalAcpMethod("authenticate")).toBe(false)
    expect(shouldJournalAcpMethod("session/prompt")).toBe(true)
  })
})
