import { randomInt as nodeRandomInt, randomUUID } from "node:crypto"
import { MAX_TURNS_PER_SESSION, PROMPT_PLACEHOLDER } from "../fixtures/demo.constants"
import {
  cannedReplyCount,
  cannedReplyFrames,
  staticLimitFrames,
  turnOneElicitationAnswer,
  turnOneElicitationParams,
  turnOneExtensionParams,
  turnOneFinalFrames,
  turnOneIntroFrames,
  turnOnePermissionParams,
} from "../fixtures/turn.scripts"
import { DemoReplyValue, DemoSession, DemoStore, DemoTurnRecord } from "../demo.state"
import {
  cancelledFrame,
  promptCompleteFrame,
  sessionUpdateFrame,
  textChunk,
  DemoServerFrame,
} from "./frames"

export type TurnStartResult = "started" | "busy" | "limit" | "session_missing"

type StartTurnParams = {
  store: DemoStore
  deviceId: string
  session: DemoSession
  delayMs?: number
  randomInt?: (minInclusive: number, maxExclusive: number) => number
  interactionTimeoutMs?: number
}

const defaultRandomInt = (minInclusive: number, maxExclusive: number): number =>
  nodeRandomInt(minInclusive, maxExclusive)

const pause = async (delayMs: number | undefined): Promise<void> => {
  if (delayMs === 0) {
    return
  }
  const ms = delayMs ?? nodeRandomInt(100, 301)
  await Bun.sleep(ms)
}

const requestId = (prefix: string): string => `${prefix}_${randomUUID()}`

const withoutPromptComplete = (
  frames: ReadonlyArray<DemoServerFrame>,
): ReadonlyArray<DemoServerFrame> => frames.filter((frame) => frame.type !== "prompt_complete")

export const startPromptTurn = (params: StartTurnParams): TurnStartResult => {
  const { store, deviceId, session } = params

  if (session.turns.length >= MAX_TURNS_PER_SESSION) {
    void runLimitBlock(params)
    return "limit"
  }

  if (session.activeTurn !== null) {
    return "busy"
  }

  const number = session.turns.length + 1
  const kind = number === 1 ? "full" : "canned"
  const choose = params.randomInt ?? defaultRandomInt
  const record: DemoTurnRecord = {
    number,
    kind,
    cannedIndex: kind === "canned" ? choose(0, cannedReplyCount) : null,
    status: "running",
    permissionOptionId: null,
    elicitationRequestId: null,
    elicitationAccepted: null,
    extensionRequestId: null,
    extensionReplied: null,
  }

  if (!store.beginTurn(deviceId, session.id, record)) {
    return "busy"
  }

  void runTurn(params, record)
  return "started"
}

const runTurn = async (params: StartTurnParams, turnRecord: DemoTurnRecord): Promise<void> => {
  const record = turnRecord
  const { store, deviceId, session } = params
  const identity = { agentId: session.agentId, sessionId: session.id }
  const interactionTimeoutMs = params.interactionTimeoutMs ?? 120_000

  const stillActive = (): boolean => {
    const current = store.getSession(deviceId, session.id)
    return current?.activeTurn?.cancelled === false
  }

  const emit = async (frame: DemoServerFrame): Promise<boolean> => {
    if (!stillActive()) {
      return false
    }
    await pause(params.delayMs)
    if (!stillActive()) {
      return false
    }
    store.broadcast(deviceId, session.id, frame)
    return true
  }

  const finishCancelled = (): void => {
    record.status = "cancelled"
    store.endTurn(deviceId, session.id)
  }

  if (record.kind === "canned") {
    const frames = cannedReplyFrames(identity, record.cannedIndex ?? 0, record.number)
    for (const frame of withoutPromptComplete(frames)) {
      if (!(await emit(frame))) {
        finishCancelled()
        return
      }
    }
    if (!stillActive()) {
      finishCancelled()
      return
    }
    record.status = "completed"
    store.endTurn(deviceId, session.id)
    store.broadcast(deviceId, session.id, promptCompleteFrame(identity.agentId, identity.sessionId))
    return
  }

  for (const frame of turnOneIntroFrames(identity)) {
    if (!(await emit(frame))) {
      finishCancelled()
      return
    }
  }

  const waitForReply = (
    kind: "permission" | "elicitation" | "extension",
    pendingRequestId: string,
  ): Promise<DemoReplyValue> =>
    new Promise<DemoReplyValue>((resolve) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null

      const finish = (value: DemoReplyValue): void => {
        if (settled) {
          return
        }
        settled = true
        if (timer !== null) {
          clearTimeout(timer)
        }
        store.forgetPendingReply(pendingRequestId)
        resolve(value)
      }

      store.registerPendingReply({
        requestId: pendingRequestId,
        deviceId,
        sessionId: session.id,
        kind,
        resolve: finish,
      })

      if (interactionTimeoutMs > 0) {
        timer = setTimeout(() => {
          finish({ cancelled: false })
        }, interactionTimeoutMs)
      }
    })

  const permissionRequestId = requestId("req_demo_permission")
  if (store.hasSubscribers(deviceId, session.id)) {
    store.broadcast(deviceId, session.id, {
      type: "permission_request",
      requestId: permissionRequestId,
      agentId: identity.agentId,
      sessionId: identity.sessionId,
      params: turnOnePermissionParams,
    })
    const reply = await waitForReply("permission", permissionRequestId)
    if (reply.cancelled === true || !stillActive()) {
      finishCancelled()
      return
    }
    record.permissionOptionId = reply.optionId ?? "allow-once"
  } else {
    record.permissionOptionId = "allow-once"
  }

  const elicitationRequestId = requestId("req_demo_elicitation")
  record.elicitationRequestId = elicitationRequestId
  if (store.hasSubscribers(deviceId, session.id)) {
    store.broadcast(deviceId, session.id, {
      type: "elicitation_request",
      requestId: elicitationRequestId,
      agentId: identity.agentId,
      sessionId: identity.sessionId,
      params: turnOneElicitationParams,
      expiresAt: new Date(store.now() + 60 * 60 * 1000).toISOString(),
    })
    const reply = await waitForReply("elicitation", elicitationRequestId)
    if (reply.cancelled === true || !stillActive()) {
      finishCancelled()
      return
    }
    record.elicitationAccepted = true
    store.broadcast(deviceId, session.id, {
      type: "elicitation_resolved",
      requestId: elicitationRequestId,
      agentId: identity.agentId,
      sessionId: identity.sessionId,
      reason: "replied",
      result: turnOneElicitationAnswer,
    })
  } else {
    record.elicitationAccepted = true
  }

  const extensionRequestId = requestId("req_demo_extension")
  record.extensionRequestId = extensionRequestId
  if (store.hasSubscribers(deviceId, session.id)) {
    store.broadcast(deviceId, session.id, {
      type: "extension_request",
      requestId: extensionRequestId,
      method: "demo/ask_details",
      agentId: identity.agentId,
      sessionId: identity.sessionId,
      params: turnOneExtensionParams,
    })
    const reply = await waitForReply("extension", extensionRequestId)
    if (reply.cancelled === true || !stillActive()) {
      finishCancelled()
      return
    }
    record.extensionReplied = true
  } else {
    record.extensionReplied = true
  }

  for (const frame of withoutPromptComplete(turnOneFinalFrames(identity))) {
    if (!(await emit(frame))) {
      finishCancelled()
      return
    }
  }

  if (!stillActive()) {
    finishCancelled()
    return
  }
  record.status = "completed"
  store.endTurn(deviceId, session.id)
  store.broadcast(deviceId, session.id, promptCompleteFrame(identity.agentId, identity.sessionId))
}

const runLimitBlock = async (params: StartTurnParams): Promise<void> => {
  const { store, deviceId, session } = params
  const identity = { agentId: session.agentId, sessionId: session.id }
  // A limit block writes no state and does not increment the turn count.
  const stillThere = (): boolean => store.getSession(deviceId, session.id) !== undefined

  for (const frame of staticLimitFrames(identity)) {
    if (!stillThere()) {
      return
    }
    await pause(params.delayMs)
    if (!stillThere()) {
      return
    }
    if (frame.type === "prompt_complete") {
      store.broadcast(
        deviceId,
        session.id,
        promptCompleteFrame(identity.agentId, identity.sessionId),
      )
      continue
    }
    store.broadcast(deviceId, session.id, frame)
  }
}

export const cancelPromptTurn = (params: {
  store: DemoStore
  deviceId: string
  session: DemoSession
}): boolean => {
  const { store, deviceId, session } = params
  const cancelled = store.cancelTurn(deviceId, session.id)
  if (!cancelled) {
    return false
  }
  store.broadcast(deviceId, session.id, cancelledFrame(session.agentId, session.id))
  return true
}

export const promptPlaceholderFrame = (agentId: string, sessionId: string): DemoServerFrame =>
  sessionUpdateFrame(agentId, sessionId, textChunk("user_message_chunk", PROMPT_PLACEHOLDER))
