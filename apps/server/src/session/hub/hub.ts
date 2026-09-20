import { AgentAuth } from "contracts/http/agent-auth"
import { AgentId } from "contracts/http/agent-settings"
import { AttachmentReference } from "contracts/http/attachments"
import { SessionConfig } from "contracts/http/config.options"
import { SessionStreamServerMessage } from "contracts/http/session.stream"
import { AUTH_GATED_PROMPT_MESSAGE } from "../../acp/auth.required"
import { parseAvailableCommandsUpdate } from "./commands.available"
import { createCommandsCache } from "./commands.cache"
import { makePromptAuthGate, PromptAuthGate } from "../session.prompt.auth.gate.usecase"
import {
  CommandsCache,
  SessionCwdCache,
  SessionHubCancelSession,
  SessionHubLoadSession,
  SessionHubPromptSession,
} from "../session.ports"

export type SessionKey = `${AgentId}:${string}`

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
    subscriberId: string
    agentId: AgentId
    sessionId: string
    text: string
    attachments?: ReadonlyArray<AttachmentReference>
  }) => Promise<void>
  cancel: (params: { subscriberId: string; agentId: AgentId; sessionId: string }) => Promise<void>
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
  resolvePermissionReply: (params: { requestId: string; optionId: string }) => void
  resolveExtensionReply: (params: { requestId: string; result: unknown }) => void
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

  const ensureSubscribed = (params: {
    subscriberId: string
    agentId: AgentId
    sessionId: string
  }): SessionHubSubscriber | undefined => {
    const subscriber = subscribers.get(params.subscriberId)
    if (subscriber === undefined) {
      return undefined
    }

    const key = sessionKey(params.agentId, params.sessionId)
    if (subscriber.sessionKey !== key) {
      sendError(subscriber, "Not subscribed to session", {
        agentId: params.agentId,
        sessionId: params.sessionId,
      })
      return undefined
    }

    return subscriber
  }

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

  const settlePending = (requestId: string, result: unknown) => {
    const pending = pendingById.get(requestId)
    if (pending === undefined || pending.settled) {
      return
    }

    pending.settled = true
    pendingById.delete(requestId)
    pending.resolve(result)
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
    subscribe: subscribeInternal,
    switchSession: async (params) => {
      await subscribeInternal(params)
    },
    prompt: async (params) => {
      const subscriber = ensureSubscribed(params)
      if (subscriber === undefined) {
        return
      }

      const result = await runGatedPrompt({
        agentId: params.agentId,
        sessionId: params.sessionId,
        text: params.text,
        ...(params.attachments !== undefined && params.attachments.length > 0
          ? { attachments: params.attachments }
          : {}),
      })
      if (!result.ok) {
        if (result.error.kind === "AUTH_GATED") {
          sendError(subscriber, AUTH_GATED_PROMPT_MESSAGE, {
            agentId: params.agentId,
            sessionId: params.sessionId,
          })
          return
        }

        sendError(subscriber, result.error.reason, {
          agentId: params.agentId,
          sessionId: params.sessionId,
        })
        return
      }

      fanOut(sessionKey(params.agentId, params.sessionId), {
        type: "prompt_complete",
        agentId: params.agentId,
        sessionId: params.sessionId,
      })
    },
    cancel: async (params) => {
      const subscriber = ensureSubscribed(params)
      if (subscriber === undefined) {
        return
      }

      const result = await cancelSession({
        agentId: params.agentId,
        sessionId: params.sessionId,
      })
      if (!result.ok) {
        sendError(subscriber, result.reason, {
          agentId: params.agentId,
          sessionId: params.sessionId,
        })
        return
      }

      fanOut(sessionKey(params.agentId, params.sessionId), {
        type: "cancelled",
        agentId: params.agentId,
        sessionId: params.sessionId,
      })
    },
    handleSessionUpdate: ({ agentId, sessionId, update }) => {
      const commandsUpdate = parseAvailableCommandsUpdate(update)
      if (commandsUpdate !== null) {
        commandsCache.remember({ agentId, sessionId, update: commandsUpdate })
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
    resolvePermissionReply: ({ requestId, optionId }) => {
      settlePending(requestId, {
        outcome: {
          outcome: "selected",
          optionId,
        },
      })
    },
    resolveExtensionReply: ({ requestId, result }) => {
      settlePending(requestId, result)
    },
  }
}
