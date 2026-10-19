import { AgentAuth } from "contracts/http/agent-auth"
import { AgentId } from "contracts/http/agent-settings"
import { AttachmentReference } from "contracts/http/attachments"
import { SessionConfig } from "contracts/http/config.options"
import { SessionStreamServerMessage } from "contracts/http/session.stream"
import { sanitizeFailureReason } from "../../acp/sanitize.failure.reason"
import { parseAvailableCommandsUpdate } from "./commands.available"
import { CommandsCache, createCommandsCache } from "./commands.cache"
import { ConfigOptionsCache, createConfigOptionsCache } from "./config.cache"
import { createSessionEventLog, SessionEventLog } from "./event.log"
import { parseSessionInfoUpdate } from "./session.info"
import { createSessionTitleCache, SessionTitleCache } from "./session.title.cache"
import { createPromptQueue } from "./prompt.queue"
import { makeApplySessionTitle } from "../session.apply.title.usecase"
import { PromptAccept, PromptCompleteTurn } from "../session.prompt.gate.usecase"
import {
  SessionCommandError,
  SessionHubCancelSession,
  SessionHubLoadSession,
  SessionPromptTurn,
} from "../session.ports"

export type { SessionCommandError }

export type SessionKey = `${AgentId}:${string}`

/**
 * In-memory per-session cwd cache owned by the hub. Not a port: the hub
 * creates it and hands it to the routes that read and update it.
 */
export type SessionCwdCache = {
  remember: (params: { agentId: AgentId; sessionId: string; cwd: string }) => void
  get: (params: { agentId: AgentId; sessionId: string }) => string | undefined
}

export const sessionKey = (agentId: AgentId, sessionId: string): SessionKey =>
  `${agentId}:${sessionId}`

export type SessionStreamSendOptions = Readonly<{ cursor?: string }>

export type SessionStreamSink = {
  send: (message: SessionStreamServerMessage, options?: SessionStreamSendOptions) => void
}

export type SessionHubSubscriber = {
  readonly id: string
  readonly sink: SessionStreamSink
  sessionKey: SessionKey | null
}

export type BeginClientRpcError = { readonly kind: "missing_method" }

export type BeginClientRpcResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: BeginClientRpcError }

/**
 * Prompt submission result. Turn progress and completion are not part of this
 * result: the hub queues accepted prompts and fans `prompt_complete` (or an
 * `error` event on failure) to the session group when the turn settles.
 */
export type SessionPromptCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: SessionCommandError }

export type SessionCancelCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: SessionCommandError }

/** First reply wins; the second sees `already_settled`, unknown ids see `unknown`. */
export type ResolveReplyResult = "settled" | "already_settled" | "unknown"

export type PendingClientRpc = {
  readonly requestId: string
  readonly agentId: AgentId
  readonly sessionId: string
  readonly kind: "permission" | "extension"
  readonly method?: string
  readonly params: unknown
  resolve: (result: unknown) => void
  settled: boolean
}

export type CreateSessionHubParams = {
  cwdCache: SessionCwdCache
  commandsCache?: CommandsCache
  configCache?: ConfigOptionsCache
  sessionTitleCache?: SessionTitleCache
  eventLog?: SessionEventLog
  loadSession: SessionHubLoadSession
  runPromptTurn: SessionPromptTurn
  acceptPrompt: PromptAccept
  completePromptTurn: PromptCompleteTurn
  cancelSession: SessionHubCancelSession
  createRequestId?: () => string
}

export type SessionHub = {
  addSubscriber: (subscriber: SessionHubSubscriber) => void
  removeSubscriber: (subscriberId: string) => void
  getSubscriberSession: (subscriberId: string) => SessionKey | null
  subscribe: (params: {
    subscriberId: string
    agentId: AgentId
    sessionId: string
    /** SSE Last-Event-ID: a valid cursor resumes without a full replay. */
    lastEventId?: string
  }) => Promise<void>
  switchSession: (params: {
    subscriberId: string
    agentId: AgentId
    sessionId: string
    lastEventId?: string
  }) => Promise<void>
  prompt: (params: {
    agentId: AgentId
    sessionId: string
    text: string
    attachments?: ReadonlyArray<AttachmentReference>
  }) => Promise<SessionPromptCommandResult>
  cancel: (params: { agentId: AgentId; sessionId: string }) => Promise<SessionCancelCommandResult>
  handleSessionUpdate: (params: { agentId: AgentId; sessionId: string; update: unknown }) => void
  handleSessionConfig: (params: {
    agentId: AgentId
    sessionId: string
    configOptions: SessionConfig
  }) => void
  broadcastAuthSessionUpdated: (params: { agentId: AgentId; auth: AgentAuth }) => void
  requestPermission: (params: {
    agentId: AgentId
    sessionId: string
    params: unknown
  }) => Promise<unknown>
  requestExtensionRpc: (params: {
    agentId: AgentId
    sessionId: string
    method: string
    params: unknown
  }) => Promise<unknown>
  resolvePermissionReply: (params: { requestId: string; optionId: string }) => ResolveReplyResult
  resolveExtensionReply: (params: { requestId: string; result: unknown }) => ResolveReplyResult
  /** Awaits every queued/in-flight prompt turn. Lifecycle and test seam. */
  awaitPromptTurns: () => Promise<void>
}

export const createSessionCwdCache = (): SessionCwdCache => {
  const byKey = new Map<SessionKey, string>()

  return {
    remember: ({ agentId, sessionId, cwd }) => {
      byKey.set(sessionKey(agentId, sessionId), cwd)
    },
    get: ({ agentId, sessionId }) => byKey.get(sessionKey(agentId, sessionId)),
  }
}

export const createSessionHub = ({
  cwdCache,
  commandsCache = createCommandsCache(),
  configCache = createConfigOptionsCache(),
  sessionTitleCache = createSessionTitleCache(),
  eventLog = createSessionEventLog(),
  loadSession,
  runPromptTurn,
  acceptPrompt,
  completePromptTurn,
  cancelSession,
  createRequestId = () => crypto.randomUUID(),
}: CreateSessionHubParams): SessionHub => {
  const subscribers = new Map<string, SessionHubSubscriber>()
  const subscribersBySession = new Map<SessionKey, Set<string>>()
  const replayTargetBySession = new Map<SessionKey, string>()
  const pendingById = new Map<string, PendingClientRpc>()

  const sendError = (
    subscriber: SessionHubSubscriber,
    message: string,
    ref?: { agentId: AgentId; sessionId: string },
  ) => {
    subscriber.sink.send({
      type: "error",
      message,
      ...(ref === undefined ? {} : { agentId: ref.agentId, sessionId: ref.sessionId }),
    })
  }

  const detachFromSession = (subscriber: SessionHubSubscriber) => {
    const entry = subscribers.get(subscriber.id)
    if (entry === undefined) {
      return
    }

    const previous = entry.sessionKey
    if (previous === null) {
      return
    }

    const set = subscribersBySession.get(previous)
    if (set !== undefined) {
      set.delete(entry.id)
      if (set.size === 0) {
        subscribersBySession.delete(previous)
      }
    }

    if (replayTargetBySession.get(previous) === entry.id) {
      replayTargetBySession.delete(previous)
    }

    entry.sessionKey = null
  }

  const attachToSession = (subscriber: SessionHubSubscriber, key: SessionKey) => {
    detachFromSession(subscriber)
    const entry = subscribers.get(subscriber.id)
    if (entry === undefined) {
      return
    }

    entry.sessionKey = key
    const set = subscribersBySession.get(key) ?? new Set<string>()
    set.add(entry.id)
    subscribersBySession.set(key, set)
  }

  const refForSessionKey = (key: SessionKey): { agentId: AgentId; sessionId: string } => {
    const separator = key.indexOf(":")
    return {
      agentId: key.slice(0, separator),
      sessionId: key.slice(separator + 1),
    }
  }

  const refForMessage = (
    message: SessionStreamServerMessage,
  ): { agentId: AgentId; sessionId: string } | undefined => {
    if (message.type === "session_info") {
      return { agentId: message.agentId, sessionId: message.sessionId }
    }
    return undefined
  }

  const fanOut = (key: SessionKey, message: SessionStreamServerMessage) => {
    const replayTarget = replayTargetBySession.get(key)
    if (replayTarget !== undefined) {
      // Replay events rebuild one subscriber's snapshot; they are not live
      // deltas, so they must not enter the resume log.
      const subscriber = subscribers.get(replayTarget)
      subscriber?.sink.send(message)
      return
    }

    const cursor = eventLog.append({ ...refForSessionKey(key), message })

    const ids = subscribersBySession.get(key)
    if (ids === undefined) {
      return
    }

    for (const id of ids) {
      subscribers.get(id)?.sink.send(message, { cursor })
    }
  }

  const fanOutToAgent = (agentId: AgentId, message: SessionStreamServerMessage) => {
    const prefix = `${agentId}:`
    for (const subscriber of subscribers.values()) {
      if (subscriber.sessionKey !== null && subscriber.sessionKey.startsWith(prefix)) {
        subscriber.sink.send(message)
      }
    }
  }

  const fanOutToAll = (message: SessionStreamServerMessage) => {
    const ref = refForMessage(message)
    const key = ref === undefined ? undefined : sessionKey(ref.agentId, ref.sessionId)
    const cursor = ref === undefined ? undefined : eventLog.append({ ...ref, message })

    for (const subscriber of subscribers.values()) {
      // A cursor is only meaningful to the subscriber watching that session;
      // other streams must not adopt it as their Last-Event-ID.
      const options =
        cursor !== undefined && key !== undefined && subscriber.sessionKey === key
          ? { cursor }
          : undefined
      subscriber.sink.send(message, options)
    }
  }

  const applySessionTitle = makeApplySessionTitle({
    ...sessionTitleCache,
    broadcastSessionTitle: ({ agentId, sessionId, title }) => {
      fanOutToAll({ type: "session_info", agentId, sessionId, title })
    },
  })

  type PromptJob = {
    agentId: AgentId
    sessionId: string
    text: string
    attachments?: ReadonlyArray<AttachmentReference>
  }

  const executePromptTurn = async (job: PromptJob): Promise<void> => {
    const key = sessionKey(job.agentId, job.sessionId)
    const ref = { agentId: job.agentId, sessionId: job.sessionId }
    try {
      const outcome = await runPromptTurn({
        agentId: job.agentId,
        sessionId: job.sessionId,
        text: job.text,
        ...(job.attachments !== undefined && job.attachments.length > 0
          ? { attachments: job.attachments }
          : {}),
      })
      const settled = await completePromptTurn({ agentId: job.agentId, outcome })
      if (settled.ok) {
        fanOut(key, { type: "prompt_complete", ...ref })
        return
      }
      fanOut(key, { type: "error", message: settled.reason, ...ref })
    } catch (error: unknown) {
      fanOut(key, {
        type: "error",
        message: sanitizeFailureReason(error, "Prompt turn failed"),
        ...ref,
      })
    }
  }

  const promptQueue = createPromptQueue<PromptJob>({ execute: executePromptTurn })

  const loadForSubscriber = async (params: {
    subscriber: SessionHubSubscriber
    agentId: AgentId
    sessionId: string
  }): Promise<boolean> => {
    const cwd = cwdCache.get({
      agentId: params.agentId,
      sessionId: params.sessionId,
    })
    if (cwd === undefined) {
      sendError(params.subscriber, "Unknown session cwd", {
        agentId: params.agentId,
        sessionId: params.sessionId,
      })
      return false
    }

    const key = sessionKey(params.agentId, params.sessionId)
    replayTargetBySession.set(key, params.subscriber.id)

    const loaded = await loadSession({
      agentId: params.agentId,
      sessionId: params.sessionId,
      cwd,
    })

    if (replayTargetBySession.get(key) === params.subscriber.id) {
      replayTargetBySession.delete(key)
    }

    if (!loaded.ok) {
      sendError(params.subscriber, loaded.reason, {
        agentId: params.agentId,
        sessionId: params.sessionId,
      })
      return false
    }

    return true
  }

  const sendCachedConfig = (
    subscriber: SessionHubSubscriber,
    ref: { agentId: AgentId; sessionId: string },
  ) => {
    const cachedConfig = configCache.get(ref)
    if (cachedConfig === undefined) {
      return
    }
    subscriber.sink.send({
      type: "session_config",
      agentId: ref.agentId,
      sessionId: ref.sessionId,
      configOptions: cachedConfig,
    })
  }

  const sendCachedCommandsAndTitle = (
    subscriber: SessionHubSubscriber,
    ref: { agentId: AgentId; sessionId: string },
  ) => {
    const cachedCommands = commandsCache.get(ref)
    if (cachedCommands !== undefined) {
      subscriber.sink.send({
        type: "session_update",
        agentId: ref.agentId,
        sessionId: ref.sessionId,
        update: cachedCommands,
      })
    }

    const cachedTitle = sessionTitleCache.getSessionTitle(ref)
    if (cachedTitle !== undefined) {
      subscriber.sink.send({
        type: "session_info",
        agentId: ref.agentId,
        sessionId: ref.sessionId,
        title: cachedTitle,
      })
    }
  }

  const subscribeInternal = async (params: {
    subscriberId: string
    agentId: AgentId
    sessionId: string
    lastEventId?: string
  }) => {
    const subscriber = subscribers.get(params.subscriberId)
    if (subscriber === undefined) {
      return
    }

    const key = sessionKey(params.agentId, params.sessionId)
    attachToSession(subscriber, key)

    const ref = { agentId: params.agentId, sessionId: params.sessionId }
    const catchUp =
      params.lastEventId === undefined
        ? null
        : eventLog.catchUp({ ...ref, cursor: params.lastEventId })
    if (catchUp !== null) {
      for (const entry of catchUp) {
        subscriber.sink.send(entry.message, { cursor: entry.cursor })
      }
      // Snapshots are idempotent, not transcript deltas. Resending them after
      // catch-up rebuilds a client whose process or reset left them empty
      // without paying for a loadSession replay.
      sendCachedConfig(subscriber, ref)
      sendCachedCommandsAndTitle(subscriber, ref)
      subscriber.sink.send(
        {
          type: "subscribed",
          agentId: params.agentId,
          sessionId: params.sessionId,
        },
        { cursor: eventLog.currentCursor(ref) },
      )
      return
    }

    // A missing or stale cursor starts a full replay. The reset tells the
    // client to discard its cached transcript before the replay events land.
    subscriber.sink.send({
      type: "stream_reset",
      agentId: params.agentId,
      sessionId: params.sessionId,
    })

    // Config advertised before this stream opened (create time, a previous
    // connection) would otherwise never reach the subscriber: agents only
    // re-emit config while loading a session, and a resident session does not
    // reload. Sent ahead of the load so a fresh frame from the replay is the
    // last one the client sees.
    sendCachedConfig(subscriber, ref)

    const loaded = await loadForSubscriber({
      subscriber,
      agentId: params.agentId,
      sessionId: params.sessionId,
    })
    if (!loaded) {
      detachFromSession(subscriber)
      return
    }

    sendCachedCommandsAndTitle(subscriber, ref)

    subscriber.sink.send(
      {
        type: "subscribed",
        agentId: params.agentId,
        sessionId: params.sessionId,
      },
      { cursor: eventLog.currentCursor(ref) },
    )
  }

  const beginClientRpc = (params: {
    agentId: AgentId
    sessionId: string
    kind: "permission" | "extension"
    method?: string
    requestParams: unknown
  }): Promise<BeginClientRpcResult> => {
    const key = sessionKey(params.agentId, params.sessionId)

    if (params.kind === "extension") {
      const method = params.method
      if (method === undefined || method.length === 0) {
        return Promise.resolve({
          ok: false,
          error: { kind: "missing_method" },
        })
      }

      const requestId = createRequestId()
      return new Promise((resolve) => {
        const pending: PendingClientRpc = {
          requestId,
          agentId: params.agentId,
          sessionId: params.sessionId,
          kind: "extension",
          method,
          params: params.requestParams,
          resolve: (result) => resolve({ ok: true, value: result }),
          settled: false,
        }
        pendingById.set(requestId, pending)
        fanOut(key, {
          type: "extension_request",
          requestId,
          method,
          agentId: params.agentId,
          sessionId: params.sessionId,
          params: params.requestParams,
        })
      })
    }

    const requestId = createRequestId()
    return new Promise((resolve) => {
      const pending: PendingClientRpc = {
        requestId,
        agentId: params.agentId,
        sessionId: params.sessionId,
        kind: "permission",
        method: params.method,
        params: params.requestParams,
        resolve: (result) => resolve({ ok: true, value: result }),
        settled: false,
      }
      pendingById.set(requestId, pending)
      fanOut(key, {
        type: "permission_request",
        requestId,
        agentId: params.agentId,
        sessionId: params.sessionId,
        params: params.requestParams,
      })
    })
  }

  const awaitClientRpc = async (
    begun: Promise<BeginClientRpcResult>,
    missingMethodMessage: string,
  ): Promise<unknown> => {
    const result = await begun
    if (!result.ok) {
      throw new Error(missingMethodMessage)
    }
    return result.value
  }

  const SETTLED_REQUEST_MEMORY = 256
  const settledRequestIds = new Set<string>()
  const settledRequestOrder: string[] = []

  const rememberSettled = (requestId: string) => {
    settledRequestIds.add(requestId)
    settledRequestOrder.push(requestId)
    while (settledRequestOrder.length > SETTLED_REQUEST_MEMORY) {
      const evicted = settledRequestOrder.shift()
      if (evicted !== undefined) {
        settledRequestIds.delete(evicted)
      }
    }
  }

  const settlePending = (requestId: string, result: unknown): ResolveReplyResult => {
    const pending = pendingById.get(requestId)
    if (pending === undefined) {
      return settledRequestIds.has(requestId) ? "already_settled" : "unknown"
    }

    if (pending.settled) {
      return "already_settled"
    }

    pending.settled = true
    pendingById.delete(requestId)
    rememberSettled(requestId)
    pending.resolve(result)
    return "settled"
  }

  return {
    addSubscriber: (subscriber) => {
      subscribers.set(subscriber.id, subscriber)
    },
    removeSubscriber: (subscriberId) => {
      const subscriber = subscribers.get(subscriberId)
      if (subscriber === undefined) {
        return
      }
      detachFromSession(subscriber)
      subscribers.delete(subscriberId)
    },
    getSubscriberSession: (subscriberId) => subscribers.get(subscriberId)?.sessionKey ?? null,
    subscribe: subscribeInternal,
    switchSession: async (params) => {
      await subscribeInternal(params)
    },
    prompt: async ({ agentId, sessionId, text, attachments }) => {
      const cwd = cwdCache.get({ agentId, sessionId })
      if (cwd === undefined) {
        return {
          ok: false,
          error: { kind: "unknown_session", reason: "Unknown session cwd" },
        }
      }

      const accepted = await acceptPrompt({
        agentId,
        sessionId,
        cwd,
        ...(attachments !== undefined && attachments.length > 0 ? { attachments } : {}),
      })
      if (!accepted.ok) {
        return accepted
      }

      promptQueue.enqueue({
        agentId,
        sessionId,
        text,
        ...(attachments !== undefined && attachments.length > 0 ? { attachments } : {}),
      })
      return { ok: true }
    },
    cancel: async ({ agentId, sessionId }) => {
      if (cwdCache.get({ agentId, sessionId }) === undefined) {
        return {
          ok: false,
          error: { kind: "unknown_session", reason: "Unknown session cwd" },
        }
      }

      const result = await cancelSession({ agentId, sessionId })
      if (!result.ok) {
        return { ok: false, error: { kind: "rejected", reason: result.reason } }
      }

      fanOut(sessionKey(agentId, sessionId), {
        type: "cancelled",
        agentId,
        sessionId,
      })
      return { ok: true }
    },
    handleSessionUpdate: ({ agentId, sessionId, update }) => {
      const commandsUpdate = parseAvailableCommandsUpdate(update)
      if (commandsUpdate !== null) {
        commandsCache.remember({ agentId, sessionId, update: commandsUpdate })
      }

      const sessionInfo = parseSessionInfoUpdate(update)
      if (sessionInfo !== null && sessionInfo.title !== undefined) {
        applySessionTitle({ agentId, sessionId, title: sessionInfo.title })
      }

      fanOut(sessionKey(agentId, sessionId), {
        type: "session_update",
        agentId,
        sessionId,
        update,
      })
    },
    handleSessionConfig: ({ agentId, sessionId, configOptions }) => {
      configCache.remember({ agentId, sessionId, configOptions })
      fanOut(sessionKey(agentId, sessionId), {
        type: "session_config",
        agentId,
        sessionId,
        configOptions,
      })
    },
    broadcastAuthSessionUpdated: ({ agentId, auth }) => {
      fanOutToAgent(agentId, {
        type: "auth_session_updated",
        agentId,
        auth,
      })
    },
    requestPermission: ({ agentId, sessionId, params }) =>
      awaitClientRpc(
        beginClientRpc({
          agentId,
          sessionId,
          kind: "permission",
          requestParams: params,
        }),
        "permission request failed to start",
      ),
    requestExtensionRpc: ({ agentId, sessionId, method, params }) =>
      awaitClientRpc(
        beginClientRpc({
          agentId,
          sessionId,
          kind: "extension",
          method,
          requestParams: params,
        }),
        "extension request missing method",
      ),
    resolvePermissionReply: ({ requestId, optionId }) =>
      settlePending(requestId, {
        outcome: {
          outcome: "selected",
          optionId,
        },
      }),
    resolveExtensionReply: ({ requestId, result }) => settlePending(requestId, result),
    awaitPromptTurns: () => promptQueue.awaitIdle(),
  }
}
