import { describe, expect, test } from "bun:test"
import { JournalAppendRecordSchema } from "contracts/events/journal-record"
import {
  sanitizePermissionRequest,
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

describe("sanitizePermissionRequest", () => {
  test("keeps tool metadata without permission detail", () => {
    expect(
      sanitizePermissionRequest({
        sessionId: "sess-1",
        options: [{ optionId: "allow-once", name: "Allow", description: "secret detail" }],
        toolCall: { toolCallId: "tool-1", name: "write_file" },
      }),
    ).toEqual({ toolCallId: "tool-1", toolName: "write_file" })
  })
})

describe("shouldJournalAcpMethod", () => {
  test("excludes initialize and authenticate", () => {
    expect(shouldJournalAcpMethod("initialize")).toBe(false)
    expect(shouldJournalAcpMethod("authenticate")).toBe(false)
    expect(shouldJournalAcpMethod("session/prompt")).toBe(true)
  })
})
