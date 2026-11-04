import { promptCompleteFrame, sessionUpdateFrame, textChunk } from "../sse/frames"
import { DemoServerFrame } from "../sse/frames"

type SessionIdentity = {
  agentId: string
  sessionId: string
}

const toolCall = (
  toolCallId: string,
  toolName: string,
  toolKind: "read" | "edit" | "execute",
  status: "pending" | "in_progress" | "completed" | "failed",
  title: string,
) => ({
  sessionUpdate: "tool_call",
  toolCallId,
  toolName,
  toolKind,
  status,
  title,
})

const toolCallUpdate = (
  toolCallId: string,
  status: "pending" | "in_progress" | "completed" | "failed",
) => ({
  sessionUpdate: "tool_call_update",
  toolCallId,
  status,
})

const usageUpdate = {
  sessionUpdate: "usage_update",
  used: 42_600,
  size: 200_000,
  cost: { amount: 0.0421, currency: "USD" },
}

/**
 * The transcript every seeded session replays. It is fictional and shared by
 * all three seed sessions: one rich conversation to exercise every row type.
 */
export const seedTranscriptFrames = (session: SessionIdentity): ReadonlyArray<DemoServerFrame> => {
  const { agentId, sessionId } = session
  const frame = (update: Record<string, unknown>) =>
    sessionUpdateFrame(agentId, sessionId, update as never)

  return [
    frame(
      textChunk(
        "user_message_chunk",
        "Can you review the dark mode toggle and clean up anything that looks off?",
      ),
    ),
    frame(
      textChunk(
        "agent_thought_chunk",
        "I will start by reading the toggle and the theme tokens it depends on.",
      ),
    ),
    frame(
      textChunk(
        "agent_message_chunk",
        "I found a small accessibility issue in the toggle. Let me check the token setup before I change anything.\n",
      ),
    ),
    frame(toolCall("seed-read-1", "read", "read", "pending", "src/theme/toggle.ts")),
    frame(toolCallUpdate("seed-read-1", "completed")),
    frame(toolCall("seed-edit-1", "edit", "edit", "in_progress", "src/theme/toggle.ts")),
    frame(toolCallUpdate("seed-edit-1", "completed")),
    frame(toolCall("seed-exec-1", "bash", "execute", "in_progress", "bun test src/theme")),
    frame(toolCallUpdate("seed-exec-1", "failed")),
    frame(usageUpdate),
    frame(
      textChunk(
        "agent_message_chunk",
        [
          "### Review complete",
          "",
          "The toggle now respects a stored preference before falling back to the system setting.",
          "",
          "- Added `themeStorageKey` as a single source of truth",
          "- Read the stored preference before the media query",
          "- Kept the change focused to `src/theme/toggle.ts`",
          "",
          "The theme test command is not configured in this demo, so that step failed. Nothing else needs a change.",
        ].join("\n"),
      ),
    ),
    promptCompleteFrame(agentId, sessionId),
  ]
}
