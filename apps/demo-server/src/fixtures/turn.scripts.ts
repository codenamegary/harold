import { promptCompleteFrame, sessionUpdateFrame, textChunk } from "../sse/frames"
import { DemoServerFrame, DemoSessionUpdate } from "../sse/frames"

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
): DemoSessionUpdate => ({
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
): DemoSessionUpdate => ({
  sessionUpdate: "tool_call_update",
  toolCallId,
  status,
})

export const turnOneIntroFrames = (session: SessionIdentity): ReadonlyArray<DemoServerFrame> => {
  const frame = (update: DemoSessionUpdate) =>
    sessionUpdateFrame(session.agentId, session.sessionId, update)

  return [
    frame(
      textChunk(
        "agent_thought_chunk",
        "The user wants me to run the tests and fix anything that fails. I will start with the theme test command.",
      ),
    ),
    frame(
      textChunk(
        "agent_message_chunk",
        "The user wants me to run the tests and fix anything that fails. I'll run the theme tests first, then fix the failure.",
      ),
    ),
    frame(toolCall("turn1-read", "read", "read", "pending", "src/theme/toggle.ts")),
    frame(toolCallUpdate("turn1-read", "completed")),
    frame(toolCall("turn1-exec", "bash", "execute", "pending", "bun test src/theme")),
    frame(toolCallUpdate("turn1-exec", "in_progress")),
  ]
}

export const turnOneFailureFrames = (session: SessionIdentity): ReadonlyArray<DemoServerFrame> => {
  const frame = (update: DemoSessionUpdate) =>
    sessionUpdateFrame(session.agentId, session.sessionId, update)

  return [
    frame(toolCallUpdate("turn1-exec", "failed")),
    frame(
      textChunk(
        "agent_message_chunk",
        "The theme tests failed on the dark mode contrast check. I need to know which target to patch.",
      ),
    ),
  ]
}

export const turnOneFinalFrames = (session: SessionIdentity): ReadonlyArray<DemoServerFrame> => {
  const frame = (update: DemoSessionUpdate) =>
    sessionUpdateFrame(session.agentId, session.sessionId, update)

  return [
    frame(toolCall("turn1-edit", "edit", "edit", "pending", "src/theme/toggle.ts")),
    frame(toolCallUpdate("turn1-edit", "completed")),
    frame({
      sessionUpdate: "usage_update",
      used: 58_200,
      size: 200_000,
      cost: { amount: 0.0614, currency: "USD" },
    }),
    frame(
      textChunk(
        "agent_message_chunk",
        "I applied the contrast fix to `src/theme/toggle.ts` and reran the theme tests. They pass.",
      ),
    ),
    promptCompleteFrame(session.agentId, session.sessionId),
  ]
}

export const turnOnePermissionParams = {
  toolCall: {
    toolCallId: "turn1-exec",
    name: "bash",
    title: "Run the theme test command",
    kind: "execute",
  },
  options: [
    { optionId: "allow-once", name: "Allow once", kind: "allow" },
    { optionId: "reject-once", name: "Reject once", kind: "deny" },
  ],
}

export const turnOneElicitationParams = {
  mode: "form",
  message: "The theme tests failed on the dark mode contrast check.",
  toolCallId: "turn1-question",
  requestedSchema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        title: "Which target should I patch?",
        oneOf: [
          { const: "preview", title: "Preview" },
          { const: "release", title: "Release" },
        ],
      },
    },
    required: ["target"],
  },
}

export const turnOneElicitationAnswer = {
  action: "accept",
  content: {
    target: "preview",
  },
}

type CannedReply = {
  thought: string
  tools: ReadonlyArray<{
    toolCallId: string
    toolName: string
    toolKind: "read" | "edit" | "execute"
    title: string
  }>
  message: string
}

const cannedReplies: ReadonlyArray<CannedReply> = [
  {
    thought: "I will check the theme files again before answering.",
    tools: [
      {
        toolCallId: "canned-read",
        toolName: "read",
        toolKind: "read",
        title: "src/theme/toggle.ts",
      },
    ],
    message:
      "The toggle is in good shape. The stored preference wins first, then the system setting, and the fallback stays readable.\n\nNothing else needs a change.",
  },
  {
    thought: "A quick comparison of the two theme paths is enough here.",
    tools: [
      {
        toolCallId: "canned-read",
        toolName: "read",
        toolKind: "read",
        title: "src/theme/tokens.css",
      },
      {
        toolCallId: "canned-edit",
        toolName: "edit",
        toolKind: "edit",
        title: "src/theme/tokens.css",
      },
    ],
    message:
      "Both paths resolve to the same tokens now, so the light and dark themes stay in sync.\n\nI kept the edit small.",
  },
  {
    thought: "I will run the theme check and report the result.",
    tools: [
      {
        toolCallId: "canned-exec",
        toolName: "bash",
        toolKind: "execute",
        title: "bun test",
      },
    ],
    message: "The theme check is clean. Send another prompt if you want another pass.",
  },
]

export const cannedReplyCount = cannedReplies.length

export const cannedReplyFrames = (
  session: SessionIdentity,
  index: number,
  turnNumber: number,
): ReadonlyArray<DemoServerFrame> => {
  const reply = cannedReplies[index] ?? cannedReplies[0]
  if (reply === undefined) {
    return []
  }

  const prefix = `turn${turnNumber}`
  const frames: DemoServerFrame[] = [
    sessionUpdateFrame(
      session.agentId,
      session.sessionId,
      textChunk("agent_thought_chunk", reply.thought),
    ),
  ]

  reply.tools.forEach((tool, toolIndex) => {
    const toolCallId = `${prefix}-${tool.toolCallId}-${toolIndex}`
    frames.push(
      sessionUpdateFrame(
        session.agentId,
        session.sessionId,
        toolCall(toolCallId, tool.toolName, tool.toolKind, "pending", tool.title),
      ),
    )
    frames.push(
      sessionUpdateFrame(
        session.agentId,
        session.sessionId,
        toolCallUpdate(toolCallId, "completed"),
      ),
    )
  })

  frames.push(
    sessionUpdateFrame(
      session.agentId,
      session.sessionId,
      textChunk("agent_message_chunk", reply.message),
    ),
  )
  frames.push(promptCompleteFrame(session.agentId, session.sessionId))
  return frames
}

export const staticLimitFrames = (session: SessionIdentity): ReadonlyArray<DemoServerFrame> => [
  sessionUpdateFrame(
    session.agentId,
    session.sessionId,
    textChunk("agent_thought_chunk", "The demo conversation has reached its three-turn limit."),
  ),
  sessionUpdateFrame(
    session.agentId,
    session.sessionId,
    textChunk(
      "agent_message_chunk",
      [
        "### That is the end of the demo conversation",
        "",
        "This demo session is done after three tracked turns. Start a new session to run the full demo again.",
        "",
        `Reminder: this session expires 15 minutes after creation. The demo does not extend the timer.`,
      ].join("\n"),
    ),
  ),
  promptCompleteFrame(session.agentId, session.sessionId),
]
