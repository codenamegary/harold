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
        "The user wants me to review the dark mode toggle. I will start by reading the toggle and the theme tokens it depends on.",
      ),
    ),
    frame(
      textChunk(
        "agent_message_chunk",
        "The user wants me to review the dark mode toggle. I'll start by reading the toggle and the theme tokens it depends on.",
      ),
    ),
    frame(toolCall("seed-read-1", "read", "read", "pending", "src/theme/toggle.ts")),
    frame(toolCallUpdate("seed-read-1", "completed")),
    frame(toolCall("seed-read-2", "read", "read", "pending", "src/theme/tokens.css")),
    frame(toolCallUpdate("seed-read-2", "completed")),
    frame(
      textChunk(
        "agent_message_chunk",
        "I found a contrast issue in the toggle. I'm checking the token setup before I change anything.",
      ),
    ),
    frame(usageUpdate),
    promptCompleteFrame(agentId, sessionId),
  ]
}
