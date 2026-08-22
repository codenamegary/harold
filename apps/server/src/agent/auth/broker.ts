import { randomUUID } from "node:crypto"
import os from "node:os"
import { AgentId } from "contracts/http/agent-settings"
import {
  AgentAuth,
  AgentAuthSession,
  AgentAuthStatus,
  AgentAuthSummary,
  AuthSessionAction,
  AuthStepV1,
} from "contracts/http/agent-auth"
import { AuthAdapter, AdapterAuthContext } from "./adapters/adapter"
import { resolveAuthAdapter } from "./registry"

export type AuthBrokerError =
  | { kind: "agent_not_found" }
  | { kind: "session_not_found" }
  | { kind: "session_conflict"; sessionId: string }
  | { kind: "logout_blocked"; sessionId: string }
  | { kind: "invalid_action"; detail: string }

export type AuthBrokerResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AuthBrokerError }

type CachedAuthStatus = {
  status: AgentAuthStatus
  error: string | null
  canLogout: boolean
}

type InFlightSession = {
  sessionId: string
  agentId: AgentId
  status: AgentAuthSession["status"]
  steps: AuthStepV1[]
  error: string | null
  retry: boolean
}

export type AuthBroker = {
  getSummary: (agentId: AgentId) => Promise<AgentAuthSummary>
  get: (agentId: AgentId) => Promise<AgentAuth>
  observeInitialize: (input: {
    agentId: AgentId
    initializeResult: unknown
  }) => Promise<void>
  startSession: (input: { agentId: AgentId }) => Promise<AuthBrokerResult<AgentAuthSession>>
  applyAction: (input: {
    agentId: AgentId
    sessionId: string
    action: AuthSessionAction
  }) => Promise<AuthBrokerResult<AgentAuthSession>>
  logout: (agentId: AgentId) => Promise<AuthBrokerResult<AgentAuthSummary>>
  subscribe: (listener: (event: { agentId: AgentId; auth: AgentAuth }) => void) => () => void
}

export type CreateAuthBrokerParams = {
  agentExists: (agentId: AgentId) => boolean
  requestRespawn: (agentId: AgentId) => Promise<void>
  resolveAdapter?: (agentId: AgentId) => AuthAdapter
  hostMachineName?: string
}

const defaultHostMachineName = () => os.hostname()

const buildContext = (
  agentId: AgentId,
  hostMachineName: string,
  initializeResult?: unknown,
): AdapterAuthContext => ({
  agentId,
  hostIdentity: { id: "default" },
  hostMachineName,
  initializeResult,
})

const toSummary = (
  status: CachedAuthStatus,
  activeSession: InFlightSession | null,
): AgentAuthSummary => ({
  status: status.status,
  error: status.error,
  activeSessionId:
    activeSession !== null && activeSession.status === "in_progress"
      ? activeSession.sessionId
      : null,
  canLogout: status.canLogout,
})

const toWireSession = (session: InFlightSession): AgentAuthSession => ({
  sessionId: session.sessionId,
  agentId: session.agentId,
  status: session.status,
  steps: session.steps,
  error: session.error,
})

export const createAuthBroker = (params: CreateAuthBrokerParams): AuthBroker => {
  const hostMachineName = params.hostMachineName ?? defaultHostMachineName()
  const initializeResults = new Map<AgentId, unknown>()
  const statusCache = new Map<AgentId, CachedAuthStatus>()
  const sessions = new Map<AgentId, InFlightSession>()
  const listeners = new Set<(event: { agentId: AgentId; auth: AgentAuth }) => void>()

  const resolveAdapter = (agentId: AgentId) =>
    params.resolveAdapter?.(agentId) ?? resolveAuthAdapter(agentId)

  const getCachedStatus = (agentId: AgentId): CachedAuthStatus =>
    statusCache.get(agentId) ?? {
      status: "unknown",
      error: null,
      canLogout: false,
    }

  const setCachedStatus = (agentId: AgentId, next: CachedAuthStatus) => {
    statusCache.set(agentId, next)
  }

  const buildAuth = async (agentId: AgentId): Promise<AgentAuth | null> => {
    if (!params.agentExists(agentId)) {
      return null
    }
    const session = sessions.get(agentId) ?? null
    const cached = getCachedStatus(agentId)
    return {
      agentId,
      status: cached.status,
      error: cached.error,
      session:
        session === null || session.status !== "in_progress" ? null : toWireSession(session),
    }
  }

  const emit = async (agentId: AgentId) => {
    const auth = await buildAuth(agentId)
    if (auth === null) {
      return
    }
    listeners.forEach((listener) => listener({ agentId, auth }))
  }

  const probeAndCache = async (agentId: AgentId) => {
    const adapter = resolveAdapter(agentId)
    const ctx = buildContext(
      agentId,
      hostMachineName,
      initializeResults.get(agentId),
    )
    const probe = await adapter.probe(ctx)
    setCachedStatus(agentId, {
      status: probe.status,
      error: probe.error,
      canLogout: probe.canLogout,
    })
    await emit(agentId)
  }

  const finishSession = async (
    agentId: AgentId,
    outcome: "succeeded" | "failed" | "cancelled",
    message: string | null,
  ) => {
    const session = sessions.get(agentId)
    if (session === undefined) {
      return
    }
    session.status = outcome === "succeeded" ? "succeeded" : outcome === "cancelled" ? "cancelled" : "failed"
    session.steps = [
      {
        type: "done",
        outcome,
        message,
      },
    ]
    sessions.delete(agentId)
    await emit(agentId)
  }

  return {
    getSummary: async (agentId) => {
      if (!params.agentExists(agentId)) {
        return {
          status: "unknown",
          error: null,
          activeSessionId: null,
          canLogout: false,
        }
      }
      const session = sessions.get(agentId) ?? null
      return toSummary(getCachedStatus(agentId), session)
    },

    get: async (agentId) => {
      const auth = await buildAuth(agentId)
      if (auth === null) {
        return {
          agentId,
          status: "unknown",
          error: null,
          session: null,
        }
      }
      return auth
    },

    observeInitialize: async ({ agentId, initializeResult }) => {
      initializeResults.set(agentId, initializeResult)
      await probeAndCache(agentId)
    },

    startSession: async ({ agentId }) => {
      if (!params.agentExists(agentId)) {
        return { ok: false, error: { kind: "agent_not_found" } }
      }

      const existing = sessions.get(agentId)
      if (existing !== undefined && existing.status === "in_progress") {
        return { ok: true, value: toWireSession(existing) }
      }

      const adapter = resolveAdapter(agentId)
      const ctx = buildContext(
        agentId,
        hostMachineName,
        initializeResults.get(agentId),
      )
      const sessionId = randomUUID()
      const retry = existing !== undefined
      const started = await adapter.start(ctx, { sessionId, retry })
      const session: InFlightSession = {
        sessionId,
        agentId,
        status: "in_progress",
        steps: started.steps,
        error: null,
        retry,
      }
      sessions.set(agentId, session)
      await emit(agentId)
      return { ok: true, value: toWireSession(session) }
    },

    applyAction: async ({ agentId, sessionId, action }) => {
      if (!params.agentExists(agentId)) {
        return { ok: false, error: { kind: "agent_not_found" } }
      }

      const session = sessions.get(agentId)
      if (session === undefined || session.sessionId !== sessionId) {
        return { ok: false, error: { kind: "session_not_found" } }
      }

      const adapter = resolveAdapter(agentId)
      const ctx = buildContext(
        agentId,
        hostMachineName,
        initializeResults.get(agentId),
      )

      switch (action.type) {
        case "cancel": {
          await adapter.abort(ctx, { sessionId })
          await probeAndCache(agentId)
          await finishSession(agentId, "cancelled", null)
          return {
            ok: true,
            value: {
              sessionId,
              agentId,
              status: "cancelled",
              steps: [{ type: "done", outcome: "cancelled", message: null }],
              error: null,
            },
          }
        }
        case "confirm": {
          session.steps = [{ type: "working", label: "Checking sign-in…" }]
          await emit(agentId)
          await adapter.continue(ctx, { sessionId, action })
          await probeAndCache(agentId)
          if (adapter.completionPolicy === "reconnect") {
            await params.requestRespawn(agentId)
          }
          await finishSession(agentId, "succeeded", null)
          return {
            ok: true,
            value: {
              sessionId,
              agentId,
              status: "succeeded",
              steps: [{ type: "done", outcome: "succeeded", message: null }],
              error: null,
            },
          }
        }
      }
    },

    logout: async (agentId) => {
      if (!params.agentExists(agentId)) {
        return { ok: false, error: { kind: "agent_not_found" } }
      }

      const active = sessions.get(agentId)
      if (active !== undefined && active.status === "in_progress") {
        return {
          ok: false,
          error: { kind: "logout_blocked", sessionId: active.sessionId },
        }
      }

      const adapter = resolveAdapter(agentId)
      const ctx = buildContext(
        agentId,
        hostMachineName,
        initializeResults.get(agentId),
      )
      await adapter.logout(ctx)
      if (adapter.completionPolicy === "reconnect") {
        await params.requestRespawn(agentId)
      }
      await probeAndCache(agentId)
      const session = sessions.get(agentId) ?? null
      return { ok: true, value: toSummary(getCachedStatus(agentId), session) }
    },

    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
