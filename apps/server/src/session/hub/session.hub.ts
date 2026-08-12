import { AgentId } from "contracts/http/agent-settings"
import { SessionStreamServerMessage } from "contracts/http/session.stream"

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

export type SessionHubLoadSession = (params: {
  agentId: AgentId
  sessionId: string
  cwd: string
}) => Promise<{ ok: true } | { ok: false; reason: string }>

export type SessionHubPromptSession = (params: {
  agentId: AgentId
  sessionId: string
  text: string
}) => Promise<{ ok: true } | { ok: false; reason: string }>

export type SessionHubCancelSession = (params: {
  agentId: AgentId
  sessionId: string
}) => Promise<{ ok: true } | { ok: false; reason: string }>

export type SessionCwdCache = {
  remember: (params: { agentId: AgentId; sessionId: string; cwd: string }) => void
  get: (params: { agentId: AgentId; sessionId: string }) => string | undefined
}

export type PendingClientRpc = {
  readonly requestId: string
  readonly agentId: AgentId
  readonly sessionId: string
  readonly kind: "permission" | "cursor"
  readonly method?: string
  readonly params: unknown
  resolve: (result: unknown) => void
  settled: boolean
}

export type CreateSessionHubParams = {
  cwdCache: SessionCwdCache
  loadSession: SessionHubLoadSession
  promptSession: SessionHubPromptSession
  cancelSession: SessionHubCancelSession
  createRequestId?: () => string
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
  }) => Promise<void>
  cancel: (params: {
    subscriberId: string
    agentId: AgentId
    sessionId: string
  }) => Promise<void>
  handleSessionUpdate: (params: {
    agentId: AgentId
    sessionId: string
    update: unknown
  }) => void
  requestPermission: (params: {
    agentId: AgentId
    sessionId: string
    params: unknown
  }) => Promise<unknown>
  requestCursor: (params: {
    agentId: AgentId
    sessionId: string
    method: string
    params: unknown
  }) => Promise<unknown>
  resolvePermissionReply: (params: {
    requestId: string
    optionId: string
  }) => void
  resolveCursorReply: (params: {
    requestId: string
    result: unknown
  }) => void
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
  loadSession,
  promptSession,
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
      ...(ref === undefined
        ? {}
        : { agentId: ref.agentId, sessionId: ref.sessionId }),
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

    subscriber.sink.send({
      type: "subscribed",
      agentId: params.agentId,
      sessionId: params.sessionId,
    })
  }

  const beginClientRpc = (params: {
    agentId: AgentId
    sessionId: string
    kind: "permission" | "cursor"
    method?: string
    requestParams: unknown
  }): Promise<unknown> => {
    const requestId = createRequestId()
    const key = sessionKey(params.agentId, params.sessionId)

    return new Promise((resolve, reject) => {
      if (params.kind === "cursor") {
        const method = params.method
        if (method === undefined || method.length === 0) {
          reject(new Error("cursor request missing method"))
          return
        }

        const pending: PendingClientRpc = {
          requestId,
          agentId: params.agentId,
          sessionId: params.sessionId,
          kind: "cursor",
          method,
          params: params.requestParams,
          resolve,
          settled: false,
        }
        pendingById.set(requestId, pending)
        fanOut(key, {
          type: "cursor_request",
          requestId,
          method,
          agentId: params.agentId,
          sessionId: params.sessionId,
          params: params.requestParams,
        })
        return
      }

      const pending: PendingClientRpc = {
        requestId,
        agentId: params.agentId,
        sessionId: params.sessionId,
        kind: "permission",
        method: params.method,
        params: params.requestParams,
        resolve,
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

      const result = await promptSession({
        agentId: params.agentId,
        sessionId: params.sessionId,
        text: params.text,
      })
      if (!result.ok) {
        sendError(subscriber, result.reason, {
          agentId: params.agentId,
          sessionId: params.sessionId,
        })
      }
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
      }
    },
    handleSessionUpdate: ({ agentId, sessionId, update }) => {
      fanOut(sessionKey(agentId, sessionId), {
        type: "session_update",
        agentId,
        sessionId,
        update,
      })
    },
    requestPermission: ({ agentId, sessionId, params }) =>
      beginClientRpc({
        agentId,
        sessionId,
        kind: "permission",
        requestParams: params,
      }),
    requestCursor: ({ agentId, sessionId, method, params }) =>
      beginClientRpc({
        agentId,
        sessionId,
        kind: "cursor",
        method,
        requestParams: params,
      }),
    resolvePermissionReply: ({ requestId, optionId }) => {
      settlePending(requestId, {
        outcome: {
          outcome: "selected",
          optionId,
        },
      })
    },
    resolveCursorReply: ({ requestId, result }) => {
      settlePending(requestId, result)
    },
  }
}
