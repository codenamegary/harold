import { sanitizeAcpRejection } from "../sanitize-acp-error"
import { isAcpJsonRpcError } from "../transport/json-rpc-error"
import { AcpSession } from "../supervisor/models"
import { AgentMethodTable } from "./method.table"
import {
  ANY_AGENT,
  AgentMethodDeclaration,
  AgentMethodHandler,
  RequiredCapabilityPath,
} from "./method"

export const sessionListMethod = "session/list"

export const sessionListRequires: RequiredCapabilityPath = "sessionCapabilities.list"

export const sessionListDeclaration: AgentMethodDeclaration = {
  method: sessionListMethod,
  requires: sessionListRequires,
}

const nowIso = (): string => new Date().toISOString()

const parseListedSessions = (result: unknown): ReadonlyArray<{
  sessionId: string
  cwd: string
  title: string
  updatedAt: string
}> => {
  const value = result as {
    sessions?: ReadonlyArray<{
      sessionId?: string
      cwd?: string
      title?: string
      updatedAt?: string
    }>
  }

  if (!Array.isArray(value.sessions)) {
    return []
  }

  return value.sessions.flatMap((session) => {
    if (session.sessionId === undefined) {
      return []
    }

    return [
      {
        sessionId: session.sessionId,
        cwd: session.cwd ?? "",
        title: session.title ?? session.sessionId,
        updatedAt: session.updatedAt ?? nowIso(),
      },
    ]
  })
}

const sanitizeListFailureReason = (error: unknown, fallback: string): string => {
  if (isAcpJsonRpcError(error)) {
    return sanitizeAcpRejection({
      message: error.message,
      data: error.data,
    })
  }

  const message = error instanceof Error ? error.message : fallback
  return sanitizeAcpRejection({ message })
}

export const createSessionListHandler = (): AgentMethodHandler<"session/list"> => {
  return async ({ params, context }) => {
    if (!context.supportsCapability(sessionListRequires)) {
      return { ok: false, reason: "Agent does not support session/list" }
    }

    try {
      const listed = parseListedSessions(
        await context.transport.request(
          "session/list",
          params.cwd === undefined ? {} : { cwd: params.cwd },
        ),
      )

      const sessions = listed.flatMap((session): ReadonlyArray<AcpSession> => {
        if (params.cwd !== undefined && session.cwd !== params.cwd) {
          return []
        }

        context.sessionOwnership.remember({
          agentId: context.agentId,
          acpSessionId: session.sessionId,
        })
        context.onSessionDiscovered({
          agentId: context.agentId,
          sessionId: session.sessionId,
          cwd: session.cwd,
        })

        return [
          {
            agentId: context.agentId,
            sessionId: session.sessionId,
            cwd: session.cwd,
            title: session.title,
            updatedAt: session.updatedAt,
          },
        ]
      })

      return { ok: true, sessions }
    } catch (error: unknown) {
      return {
        ok: false,
        reason: sanitizeListFailureReason(error, "session/list failed"),
      }
    }
  }
}

export const registerSessionListHandler = (table: AgentMethodTable): void => {
  table.register({
    agentId: ANY_AGENT,
    method: sessionListMethod,
    handler: createSessionListHandler(),
  })
}
