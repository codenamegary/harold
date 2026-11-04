export type DemoSessionUpdate = {
  sessionUpdate: string
} & Record<string, unknown>

export type DemoServerFrame =
  | {
      type: "session_update"
      agentId: string
      sessionId: string
      update: DemoSessionUpdate
    }
  | { type: "stream_reset"; agentId: string; sessionId: string }
  | { type: "subscribed"; agentId: string; sessionId: string }
  | {
      type: "session_config"
      agentId: string
      sessionId: string
      configOptions: ReadonlyArray<unknown>
    }
  | {
      type: "permission_request"
      requestId: string
      agentId: string
      sessionId: string
      params: unknown
    }
  | {
      type: "extension_request"
      requestId: string
      method: string
      agentId: string
      sessionId: string
      params: unknown
    }
  | {
      type: "elicitation_request"
      requestId: string
      agentId: string
      sessionId: string
      params: unknown
      expiresAt: string
    }
  | {
      type: "elicitation_resolved"
      requestId: string
      agentId: string
      sessionId: string
      reason: "replied" | "timed_out" | "session_cancelled" | "agent_exited" | "cancelled_by_agent"
      result?: unknown
    }
  | {
      type: "elicitation_completed"
      elicitationId: string
      requestId: string
      agentId: string
      sessionId: string
    }
  | { type: "error"; message: string; agentId?: string; sessionId?: string }
  | { type: "prompt_complete"; agentId: string; sessionId: string }
  | { type: "cancelled"; agentId: string; sessionId: string }
  | { type: "session_info"; agentId: string; sessionId: string; title: string | null }
  | {
      type: "session_worktree_path"
      agentId: string
      sessionId: string
      worktreePath: string | null
    }

export const sessionUpdateFrame = (
  agentId: string,
  sessionId: string,
  update: DemoSessionUpdate,
): DemoServerFrame => ({
  type: "session_update",
  agentId,
  sessionId,
  update,
})

export const promptCompleteFrame = (agentId: string, sessionId: string): DemoServerFrame => ({
  type: "prompt_complete",
  agentId,
  sessionId,
})

export const cancelledFrame = (agentId: string, sessionId: string): DemoServerFrame => ({
  type: "cancelled",
  agentId,
  sessionId,
})

export const textChunk = (
  kind: "agent_message_chunk" | "agent_thought_chunk" | "user_message_chunk",
  text: string,
): DemoSessionUpdate => ({
  sessionUpdate: kind,
  content: { type: "text", text },
})
