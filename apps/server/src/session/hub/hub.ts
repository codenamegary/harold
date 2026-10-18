import { AgentAuth } from "contracts/http/agent-auth"
import { AgentId } from "contracts/http/agent-settings"
import { AttachmentReference } from "contracts/http/attachments"
import { SessionConfig } from "contracts/http/config.options"
import { SessionStreamServerMessage } from "contracts/http/session.stream"
import { AUTH_GATED_PROMPT_MESSAGE } from "../../acp/auth.required"
import { parseAvailableCommandsUpdate } from "./commands.available"
import { CommandsCache, createCommandsCache } from "./commands.cache"
import { parseSessionInfoUpdate } from "./session.info"
import { createSessionTitleCache, SessionTitleCache } from "./session.title.cache"
import { makeApplySessionTitle } from "../session.apply.title.usecase"
import { makePromptAuthGate, PromptAuthGate } from "../session.prompt.auth.gate.usecase"
import {
  SessionHubCancelSession,
  SessionHubLoadSession,
  SessionHubPromptSession,
  SessionPromptOutcome,
} from "../session.ports"

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

export type SessionStreamSink = {
  send: (message: SessionStreamServerMessage) => void
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

/** Why a session command (prompt/cancel) was refused. */
export type SessionCommandError =
  | { readonly kind: "unknown_session"; readonly reason: string }
  | { readonly kind: "auth_gated"; readonly reason: string }
  | { readonly kind: "rejected"; readonly reason: string }

/**
 * Fast prompt-start outcome. Mid-turn progress and completion are not part of
 * this result: the hub fans `prompt_complete` (or an `error` event on failure)
 * to the session group when `completion` settles.
 */
export type SessionPromptCommandResult =
  | { readonly ok: true; readonly completion: Promise<SessionPromptOutcome> }
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
  sessionTitleCache?: SessionTitleCache
  loadSession: SessionHubLoadSession
  promptSession: SessionHubPromptSession
  cancelSession: SessionHubCancelSession
  createRequestId?: () => string
  /** Overrides the default auth-free prompt gate composed from promptSession. */
  promptGate?: PromptAuthGate
}

export type SessionHub = {
  addSubscriber: (subscriber: SessionHubSubscriber) => void
  removeSubscriber: (subscriberId: string) => void
  getSubscriberSession: (subscriberId: string) => SessionKey | null
  subscribe: (params: {
    subscriberId: string
    agentId: AgentId
    sessionId: string
  }) => Promise<void>
  switchSession: (params: {
    subscriberId: string
    agentId: AgentId
    sessionId: string
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
  sessionTitleCache = createSessionTitleCache(),
  loadSession,
  promptSession,
  cancelSession,
  createRequestId = () => crypto.randomUUID(),
  promptGate,
}: CreateSessionHubParams): SessionHub => {
  const subscribers = new Map<string, SessionHubSubscriber>()
  const subscribersBySession = new Map<SessionKey, Set<string>>()
  const replayTargetBySession = new Map<SessionKey, string>()
  const pendingById = new Map<string, PendingClientRpc>()
  const runGatedPrompt = promptGate ?? makePromptAuthGate({ promptSession })

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

  const fanOut = (key: SessionKey, message: SessionStreamServerMessage) => {
    const replayTarget = replayTargetBySession.get(key)
    if (replayTarget !== undefined) {
      const subscriber = subscribers.get(replayTarget)
      subscriber?.sink.send(message)
      return
    }

    const ids = subscribersBySession.get(key)
    if (ids === undefined) {
      return
    }

    for (const id of ids) {
      subscribers.get(id)?.sink.send(message)
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
    for (const subscriber of subscribers.values()) {
      subscriber.sink.send(message)
    }
  }

  const applySessionTitle = makeApplySessionTitle({
    ...sessionTitleCache,
    broadcastSessionTitle: ({ agentId, sessionId, title }) => {
      fanOutToAll({ type: "session_info", agentId, sessionId, title })
    },
  })

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

  const subscribeInternal = async (params: {
    subscriberId: string
    agentId: AgentId
    sessionId: string
  }) => {
    const subscriber = subscribers.get(params.subscriberId)
    if (subscriber === undefined) {
      return
    }

    const key = sessionKey(params.agentId, params.sessionId)
    attachToSession(subscriber, key)

    const loaded = await loadForSubscriber({
      subscriber,
      agentId: params.agentId,
      sessionId: params.sessionId,
    })
    if (!loaded) {
      detachFromSession(subscriber)
      return
    }

    const cachedCommands = commandsCache.get({
      agentId: params.agentId,
      sessionId: params.sessionId,
    })
    if (cachedCommands !== undefined) {
      subscriber.sink.send({
        type: "session_update",
        agentId: params.agentId,
        sessionId: params.sessionId,
        update: cachedCommands,
      })
    }

    const cachedTitle = sessionTitleCache.getSessionTitle({
      agentId: params.agentId,
      sessionId: params.sessionId,
    })
    if (cachedTitle !== undefined) {
      subscriber.sink.send({
        type: "session_info",
        agentId: params.agentId,
        sessionId: params.sessionId,
        title: cachedTitle,
      })
    }

    subscriber.sink.send({
      type: "subscribed",
      agentId: params.agentId,
      sessionId: params.sessionId,
    })
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
      if (cwdCache.get({ agentId, sessionId }) === undefined) {
        return {
          ok: false,
          error: { kind: "unknown_session", reason: "Unknown session cwd" },
        }
      }

      const started = await runGatedPrompt({
        agentId,
        sessionId,
        text,
        ...(attachments !== undefined && attachments.length > 0 ? { attachments } : {}),
      })
      if (!started.ok) {
        return started.error.kind === "AUTH_GATED"
          ? {
              ok: false,
              error: { kind: "auth_gated", reason: AUTH_GATED_PROMPT_MESSAGE },
            }
          : { ok: false, error: { kind: "rejected", reason: started.error.reason } }
      }

      const key = sessionKey(agentId, sessionId)
      return {
        ok: true,
        completion: started.completion.then((outcome) => {
          if (outcome.ok) {
            fanOut(key, { type: "prompt_complete", agentId, sessionId })
          } else {
            fanOut(key, { type: "error", message: outcome.reason, agentId, sessionId })
          }
          return outcome
        }),
      }
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
  }
}
