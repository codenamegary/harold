import { sanitizeFailureReason } from "../sanitize.failure.reason"
import { AgentMethodTable } from "./method.table"
import { requireBoundSession } from "./session.binding.guards"
import {
  ANY_AGENT,
  AgentMethodDeclaration,
  AgentMethodHandler,
  AgentMethodTransportKind,
} from "./method"

export const sessionCancelMethod = "session/cancel"

export const sessionCancelRequires = null

export const sessionCancelTransportKind: AgentMethodTransportKind = "notify"

export const sessionCancelDeclaration: AgentMethodDeclaration = {
  method: sessionCancelMethod,
  requires: sessionCancelRequires,
  transportKind: sessionCancelTransportKind,
}

export const createSessionCancelHandler = (): AgentMethodHandler<"session/cancel"> => {
  return async ({ params, context }) => {
    const { acpSessionId } = params

    const bound = requireBoundSession(context.sessionBindings, acpSessionId)
    if (!bound.ok) {
      return bound
    }

    try {
      context.transport.notify("session/cancel", { sessionId: acpSessionId })
      return { ok: true }
    } catch (error: unknown) {
      return {
        ok: false,
        reason: sanitizeFailureReason(error, "session/cancel failed"),
      }
    }
  }
}

export const registerSessionCancelHandler = (table: AgentMethodTable): void => {
  table.register({
    agentId: ANY_AGENT,
    method: sessionCancelMethod,
    handler: createSessionCancelHandler(),
  })
}
