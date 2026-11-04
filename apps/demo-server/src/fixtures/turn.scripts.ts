import { EXPIRY_NOTICE } from "./demo.constants"
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
        "I will start with the toggle, then show a permission, a question, and an extension request.",
      ),
    ),
    frame(
      textChunk(
        "agent_message_chunk",
        [
          EXPIRY_NOTICE,
          "",
          "Here is the full demo transcript. I will read the toggle, edit it, and run the check.",
        ].join("\n"),
      ),
    ),
    frame(toolCall("turn1-read", "read", "read", "pending", "src/theme/toggle.ts")),
    frame(toolCallUpdate("turn1-read", "completed")),
    frame(toolCall("turn1-edit", "edit", "edit", "in_progress", "src/theme/toggle.ts")),
    frame(toolCallUpdate("turn1-edit", "completed")),
    frame(toolCall("turn1-exec", "bash", "execute", "in_progress", "bun test")),
    frame(toolCallUpdate("turn1-exec", "failed")),
  ]
}

export const turnOneFinalFrames = (session: SessionIdentity): ReadonlyArray<DemoServerFrame> => {
  const frame = (update: DemoSessionUpdate) =>
    sessionUpdateFrame(session.agentId, session.sessionId, update)

  return [
    frame({
      sessionUpdate: "usage_update",
      used: 58_200,
      size: 200_000,
      cost: { amount: 0.0614, currency: "USD" },
    }),
    frame(
      textChunk(
        "agent_message_chunk",
        [
          "### Demo turn complete",
          "",
          "The toggle now reads a stored preference, falls back to the system setting, and keeps the theme tokens in one place.",
          "",
          "| Check | Result |",
          "| --- | --- |",
          "| Read tool | Completed |",
          "| Edit tool | Completed |",
          "| Execute tool | Failed on purpose |",
          "",
          "The execute failure is intentional so the review app can show a failed tool row. Send another prompt for a short canned reply.",
        ].join("\n"),
      ),
    ),
    promptCompleteFrame(session.agentId, session.sessionId),
  ]
}

export const turnOnePermissionParams = {
  toolCall: {
    toolCallId: "turn1-exec",
    name: "bash",
    title: "Run the demo test command",
    kind: "execute",
  },
  options: [
    { optionId: "allow-once", name: "Allow once", kind: "allow" },
    { optionId: "reject-once", name: "Reject once", kind: "deny" },
  ],
}

export const turnOneElicitationParams = {
  mode: "form",
  message: "The demo agent has a couple of questions before it finishes.",
  toolCallId: "turn1-question",
  requestedSchema: {
    type: "object",
    properties: {
      note: {
        type: "string",
        title: "What should the demo note say?",
        description: "A short note for the transcript.",
        minLength: 1,
        maxLength: 120,
      },
      target: {
        type: "string",
        title: "Which target should the demo use?",
        oneOf: [
          { const: "preview", title: "Preview" },
          { const: "release", title: "Release" },
        ],
      },
      includeBanner: {
        type: "boolean",
        title: "Include the banner?",
        default: true,
      },
    },
    required: ["note", "target"],
  },
}

export const turnOneExtensionParams = {
  prompt: "Pick a demo detail level.",
  choices: ["summary", "details"],
  default: "summary",
}

export const turnOneElicitationAnswer = {
  action: "accept",
  content: {
    note: "Looks good to me",
    target: "preview",
    includeBanner: true,
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
      "The toggle is in good shape. The stored preference wins first, then the system setting, and the fallback stays readable.\n\nNothing else needs a change in this demo.",
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
      "Both paths resolve to the same tokens now, so the light and dark themes stay in sync.\n\nI kept the edit small on purpose. This is the second canned demo reply.",
  },
  {
    thought: "I will run the demo check and report the result.",
    tools: [
      {
        toolCallId: "canned-exec",
        toolName: "bash",
        toolKind: "execute",
        title: "bun test",
      },
    ],
    message:
      "The demo check is clean. This session is only for the store review, so the command output is fictional.\n\nSend another prompt to see the final demo message.",
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
