import { sanitizeFailureReason } from "../sanitize.failure.reason"
import { AcpOperationContext } from "../transport/json.rpc.transport"
import { AgentMethodTable } from "./method.table"
import {
  ANY_AGENT,
  AgentMethodDeclaration,
  AgentMethodHandler,
  RequiredCapabilityPath,
} from "./method"

export const sessionCloseMethod = "session/close"

export const sessionCloseRequires: RequiredCapabilityPath = "sessionCapabilities.close"

export const sessionCloseDeclaration: AgentMethodDeclaration = {
  method: sessionCloseMethod,
  requires: sessionCloseRequires,
  transportKind: "request",
}

export const createSessionCloseHandler = (): AgentMethodHandler<"session/close"> => {
  return async ({ params, context }) => {
    if (!context.supportsCapability(sessionCloseRequires)) {
      return { ok: false, reason: "Agent does not support session/close" }
    }

    const { acpSessionId } = params
    context.sessionOwnership.remember({
      agentId: context.agentId,
      acpSessionId,
    })

    const binding = context.sessionBindings.getBinding(acpSessionId)
    const operationContext: AcpOperationContext | undefined =
      binding === undefined
        ? undefined
        : {
            sessionId: binding.sessionId,
            workspaceId: binding.workspaceId,
            phase: binding.phase,
          }

    try {
      await context.transport.request(
        "session/close",
        { sessionId: acpSessionId },
        operationContext,
      )
      context.sessionBindings.unbind({ acpSessionId })
      context.sessionOwnership.forget({ acpSessionId })
      return { ok: true }
    } catch (error: unknown) {
      return {
        ok: false,
        reason: sanitizeFailureReason(error, "session/close failed"),
      }
    }
  }
}

export const registerSessionCloseHandler = (table: AgentMethodTable): void => {
  table.register({
    agentId: ANY_AGENT,
    method: sessionCloseMethod,
    handler: createSessionCloseHandler(),
  })
}
