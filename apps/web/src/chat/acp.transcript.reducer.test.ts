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
})
