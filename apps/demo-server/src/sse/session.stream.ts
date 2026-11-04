import { randomUUID } from "node:crypto"
import { MAX_TURNS_PER_SESSION, PROMPT_PLACEHOLDER } from "../fixtures/demo.constants"
import { configOptionsFor } from "../fixtures/config.options"
import { seedTranscriptFrames } from "../fixtures/transcript.seed"
import {
  cannedReplyFrames,
  staticLimitFrames,
  turnOneElicitationAnswer,
  turnOneFinalFrames,
  turnOneIntroFrames,
} from "../fixtures/turn.scripts"
import { DemoSession, DemoStore } from "../demo.state"
import {
  cancelledFrame,
  promptCompleteFrame,
  sessionUpdateFrame,
  textChunk,
  DemoServerFrame,
} from "./frames"

export const DEFAULT_SSE_HEARTBEAT_MS = 25_000

const availableCommands = [
  { name: "demo", description: "Run the scripted demo transcript" },
  { name: "review", description: "Review the fake diff" },
  { name: "help", description: "Show demo commands" },
]

const availableCommandsFrame = (session: DemoSession): DemoServerFrame =>
  sessionUpdateFrame(session.agentId, session.id, {
    sessionUpdate: "available_commands_update",
    availableCommands,
  })

const sessionConfigFrame = (session: DemoSession): DemoServerFrame => ({
  type: "session_config",
  agentId: session.agentId,
  sessionId: session.id,
  configOptions: configOptionsFor(session.configValues),
})

const sessionInfoFrame = (session: DemoSession): DemoServerFrame => ({
  type: "session_info",
  agentId: session.agentId,
  sessionId: session.id,
  title: session.title,
})

const worktreePathFrame = (session: DemoSession): DemoServerFrame | null =>
  session.worktreePath === null
    ? null
    : {
        type: "session_worktree_path",
        agentId: session.agentId,
        sessionId: session.id,
        worktreePath: session.worktreePath,
      }

const withoutPromptComplete = (
  frames: ReadonlyArray<DemoServerFrame>,
): ReadonlyArray<DemoServerFrame> => frames.filter((frame) => frame.type !== "prompt_complete")

const replayTurnFrames = (session: DemoSession): ReadonlyArray<DemoServerFrame> => {
  const frames: DemoServerFrame[] = []
  const identity = { agentId: session.agentId, sessionId: session.id }

  for (const turn of session.turns) {
    if (turn.status === "cancelled") {
      frames.push(
        sessionUpdateFrame(
          session.agentId,
          session.id,
          textChunk("user_message_chunk", PROMPT_PLACEHOLDER),
        ),
        cancelledFrame(session.agentId, session.id),
      )
      continue
    }

    frames.push(
      sessionUpdateFrame(
        session.agentId,
        session.id,
        textChunk("user_message_chunk", PROMPT_PLACEHOLDER),
      ),
    )

    if (turn.kind === "canned") {
      frames.push(
        ...withoutPromptComplete(cannedReplyFrames(identity, turn.cannedIndex ?? 0, turn.number)),
      )
      continue
    }

    frames.push(...turnOneIntroFrames(identity))
    if (turn.elicitationRequestId !== null && turn.elicitationAccepted === true) {
      frames.push({
        type: "elicitation_resolved",
        requestId: turn.elicitationRequestId,
        agentId: session.agentId,
        sessionId: session.id,
        reason: "replied",
        result: turnOneElicitationAnswer,
      })
    }
    frames.push(...withoutPromptComplete(turnOneFinalFrames(identity)))
  }

  return frames
}

/**
 * The fixed preamble plus a full transcript replay. Resolved panels replay as
 * resolved frames; open panels are not re-opened. A session at the turn limit
 * appends exactly one static block.
 */
export const initialStreamFrames = (session: DemoSession): ReadonlyArray<DemoServerFrame> => {
  const frames: DemoServerFrame[] = [
    { type: "stream_reset", agentId: session.agentId, sessionId: session.id },
    { type: "subscribed", agentId: session.agentId, sessionId: session.id },
    sessionConfigFrame(session),
    sessionInfoFrame(session),
    availableCommandsFrame(session),
  ]

  const worktree = worktreePathFrame(session)
  if (worktree !== null) {
    frames.push(worktree)
  }

  if (session.seeded) {
    frames.push(
      ...withoutPromptComplete(
        seedTranscriptFrames({ agentId: session.agentId, sessionId: session.id }),
      ),
    )
  }
  frames.push(...replayTurnFrames(session))

  if (session.turns.length >= MAX_TURNS_PER_SESSION) {
    frames.push(...staticLimitFrames({ agentId: session.agentId, sessionId: session.id }))
    return frames
  }

  frames.push(promptCompleteFrame(session.agentId, session.id))
  return frames
}

type CreateSessionStreamParams = {
  store: DemoStore
  deviceId: string
  session: DemoSession
  request: Request
  heartbeatMs?: number
}

export const createSessionStreamResponse = (params: CreateSessionStreamParams): Response => {
  const { store, deviceId, session, request } = params
  const heartbeatMs = params.heartbeatMs ?? DEFAULT_SSE_HEARTBEAT_MS
  const encoder = new TextEncoder()
  let closed = false
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null

  const subscriberId = randomUUID()

  const teardown = (): void => {
    if (closed) {
      return
    }
    closed = true
    if (heartbeat !== null) {
      clearInterval(heartbeat)
      heartbeat = null
    }
    store.removeSubscriber(deviceId, subscriberId)
    try {
      controllerRef?.close()
    } catch {
      // Already closed by the client.
    }
  }

  const enqueue = (frame: DemoServerFrame): void => {
    if (closed || controllerRef === null) {
      return
    }
    try {
      controllerRef.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`))
    } catch {
      teardown()
    }
  }

  const sendComment = (comment: string): void => {
    if (closed || controllerRef === null) {
      return
    }
    try {
      controllerRef.enqueue(encoder.encode(`: ${comment}\n\n`))
    } catch {
      teardown()
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controllerRef = controller
      store.addSubscriber({
        id: subscriberId,
        deviceId,
        sessionId: session.id,
        send: enqueue,
        close: teardown,
      })

      for (const frame of initialStreamFrames(session)) {
        enqueue(frame)
      }

      heartbeat = setInterval(() => sendComment("ping"), heartbeatMs)
      request.signal.addEventListener("abort", teardown)
    },
    cancel: () => {
      teardown()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  })
}
