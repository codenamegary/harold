import { describe, expect, test } from "bun:test"
import { parseAcpUpdate } from "./acp.update"
import {
  applyPromptComplete,
  applySubscribed,
  beginUserTurn,
  emptyAcpTranscript,
  foldAcpUpdate,
} from "./acp.transcript.reducer"

describe("acp transcript reducer", () => {
  test("folds a live turn from user prompt and ACP chunks", () => {
    const started = beginUserTurn(emptyAcpTranscript, {
      turnId: "turn-1",
      text: "Explain auth",
    })
    expect(started.sessionState).toBe("running")
    expect(started.rows).toEqual([
      { kind: "user", turnId: "turn-1", text: "Explain auth" },
    ])

    const live = applySubscribed(started)
    const withThought = foldAcpUpdate(
      live,
      parseAcpUpdate({
        sessionUpdate: "agent_thought_chunk",
        text: "thinking",
      }),
    )
    const withOutput = foldAcpUpdate(
      withThought,
      parseAcpUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Auth uses JWT" },
      }),
    )
    const withMore = foldAcpUpdate(
      withOutput,
      parseAcpUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "." },
      }),
    )
    const idle = applyPromptComplete(withMore)

    expect(idle.sessionState).toBe("idle")
    expect(idle.rows).toEqual([
      { kind: "user", turnId: "turn-1", text: "Explain auth" },
      { kind: "thinking", turnId: "turn-1", text: "thinking" },
      { kind: "assistant", turnId: "turn-1", text: "Auth uses JWT." },
    ])
  })

  test("folds load replay tool calls onto the replay turn without marking running", () => {
    const withTool = foldAcpUpdate(
      emptyAcpTranscript,
      parseAcpUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        toolName: "read",
        kind: "read",
        status: "pending",
      }),
    )
    const completed = foldAcpUpdate(
      withTool,
      parseAcpUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        status: "completed",
      }),
    )
    const withAssistant = foldAcpUpdate(
      completed,
      parseAcpUpdate({
        sessionUpdate: "agent_message_chunk",
        text: "rebuilt",
      }),
    )

    expect(withAssistant.sessionState).toBeNull()
    expect(withAssistant.rows).toEqual([
      {
        kind: "tool",
        turnId: "replay",
        toolCallId: "tool-1",
        toolName: "read",
        toolKind: "read",
        status: "completed",
      },
      { kind: "assistant", turnId: "replay", text: "rebuilt" },
    ])
  })

  test("starts a new replay turn when a second user message arrives after agent output", () => {
    const firstUser = foldAcpUpdate(
      emptyAcpTranscript,
      parseAcpUpdate({
        sessionUpdate: "user_message_chunk",
        text: "First",
      }),
    )
    const firstAssistant = foldAcpUpdate(
      firstUser,
      parseAcpUpdate({
        sessionUpdate: "agent_message_chunk",
        text: "Answer one",
      }),
    )
    const secondUser = foldAcpUpdate(
      firstAssistant,
      parseAcpUpdate({
        sessionUpdate: "user_message_chunk",
        text: "Second",
      }),
    )
    const secondAssistant = foldAcpUpdate(
      secondUser,
      parseAcpUpdate({
        sessionUpdate: "agent_message_chunk",
        text: "Answer two",
      }),
    )

    expect(secondAssistant.rows).toEqual([
      { kind: "user", turnId: "replay", text: "First" },
      { kind: "assistant", turnId: "replay", text: "Answer one" },
      { kind: "user", turnId: "replay-2", text: "Second" },
      { kind: "assistant", turnId: "replay-2", text: "Answer two" },
    ])
  })

  test("marks running when live updates arrive after subscribe", () => {
    const replayed = foldAcpUpdate(
      emptyAcpTranscript,
      parseAcpUpdate({
        sessionUpdate: "agent_message_chunk",
        text: "history",
      }),
    )
    const subscribed = applySubscribed(replayed)
    expect(subscribed.sessionState).toBe("idle")

    const live = foldAcpUpdate(
      subscribed,
      parseAcpUpdate({
        sessionUpdate: "agent_message_chunk",
        text: " more",
      }),
    )
    expect(live.sessionState).toBe("running")
    expect(live.rows).toEqual([
      { kind: "assistant", turnId: "replay", text: "history more" },
    ])
  })

  test("skips empty user_message_chunk when the user row already exists", () => {
    const started = beginUserTurn(emptyAcpTranscript, {
      turnId: "turn-1",
      text: "Explain auth",
    })
    const next = foldAcpUpdate(
      started,
      parseAcpUpdate({
        sessionUpdate: "user_message_chunk",
      }),
    )
    expect(next.rows).toHaveLength(1)
  })

  test("fills tool detail from tool_call_update onto the existing row", () => {
    const started = beginUserTurn(emptyAcpTranscript, {
      turnId: "turn-1",
      text: "run it",
    })
    const withCall = foldAcpUpdate(
      started,
      parseAcpUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "call-1",
        title: "bash",
        kind: "execute",
        status: "in_progress",
      }),
    )
    const withOutput = foldAcpUpdate(
      withCall,
      parseAcpUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "call-1",
        status: "completed",
        _meta: { terminal_output: { terminal_id: "call-1", data: "out" } },
      }),
    )

    expect(withOutput.rows).toEqual([
      { kind: "user", turnId: "turn-1", text: "run it" },
      {
        kind: "tool",
        turnId: "turn-1",
        toolCallId: "call-1",
        toolName: "bash",
        toolKind: "execute",
        status: "completed",
        detail: "out",
      },
    ])
  })

  test("appends streamed terminal detail without duplicating replayed output", () => {
    const started = beginUserTurn(emptyAcpTranscript, {
      turnId: "turn-1",
      text: "run it",
    })
    const withCall = foldAcpUpdate(
      started,
      parseAcpUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "call-1",
        title: "bash",
        kind: "execute",
        status: "in_progress",
      }),
    )
    const withChunk = foldAcpUpdate(
      withCall,
      parseAcpUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "call-1",
        status: "in_progress",
        _meta: { terminal_output: { terminal_id: "call-1", data: "PLAN.md\n" } },
      }),
    )
    const withRest = foldAcpUpdate(
      withChunk,
      parseAcpUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "call-1",
        status: "completed",
        _meta: {
          terminal_output: { terminal_id: "call-1", data: "PLAN.md\napps\n" },
        },
      }),
    )

    const row = withRest.rows.findLast((r) => r.kind === "tool")
    expect(row).toMatchObject({ kind: "tool", detail: "PLAN.md\napps\n" })
  })

  test("does not duplicate detail when the update repeats the tool result", () => {
    const started = beginUserTurn(emptyAcpTranscript, {
      turnId: "turn-1",
      text: "read it",
    })
    const withCall = foldAcpUpdate(
      started,
      parseAcpUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "call-1",
        title: "read",
        kind: "read",
        status: "completed",
        rawOutput: {
          role: "toolResult",
          toolCallId: "call-1",
          content: [{ type: "text", text: "file body" }],
        },
      }),
    )
    const withUpdate = foldAcpUpdate(
      withCall,
      parseAcpUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "call-1",
        status: "completed",
        content: [
          { type: "content", content: { type: "text", text: "file body" } },
        ],
        rawOutput: {
          role: "toolResult",
          toolCallId: "call-1",
          content: [{ type: "text", text: "file body" }],
        },
      }),
    )

    const row = withUpdate.rows.findLast((r) => r.kind === "tool")
    expect(row).toMatchObject({ kind: "tool", detail: "file body" })
  })
})
