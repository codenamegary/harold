import { createTurnId } from "../../session/create.turn.id"
import { sanitizeAcpRejection } from "../sanitize.error"
import { AcpSessionPromptResult } from "../supervisor/models"
import { isAcpJsonRpcError } from "../transport/json-rpc-error"
import { AcpOperationContext } from "../transport/json-rpc-transport"
import { AgentMethodTable } from "./method.table"
import { requireBoundSession } from "./session.binding.guards"
import {
  ANY_AGENT,
  AgentMethodDeclaration,
  AgentMethodHandler,
  AgentMethodTransportKind,
} from "./method"

export const sessionPromptMethod = "session/prompt"

export const sessionPromptRequires = null

export const sessionPromptTransportKind: AgentMethodTransportKind = "request"

export const sessionPromptDeclaration: AgentMethodDeclaration = {
  method: sessionPromptMethod,
  requires: sessionPromptRequires,
  transportKind: sessionPromptTransportKind,
}

const sanitizePromptFailureReason = (error: unknown, fallback: string): string => {
  if (isAcpJsonRpcError(error)) {
    return sanitizeAcpRejection({
      message: error.message,
      data: error.data,
    })
  }

  const message = error instanceof Error ? error.message : fallback
  return sanitizeAcpRejection({ message })
}

export const createSessionPromptHandler = (): AgentMethodHandler<"session/prompt"> => {
  return async ({ params, context }) => {
    const { acpSessionId, prompt } = params

    const bound = requireBoundSession(context.sessionBindings, acpSessionId)
    if (!bound.ok) {
      return bound
    }

    const turnId = createTurnId()
    const promptRequestId = context.transport.allocateRequestId()
    const operationContext: AcpOperationContext = {
      sessionId: bound.binding.sessionId,
      workspaceId: bound.binding.workspaceId,
      turnId,
      phase: bound.binding.phase,
    }

    context.sessionBindings.setActiveTurnId({ acpSessionId, turnId })

    const transport = context.transport
    const completion = (async (): Promise<AcpSessionPromptResult> => {
      try {
        const result = await transport.request(
          "session/prompt",
          {
            sessionId: acpSessionId,
            prompt,
          },
          operationContext,
          { requestId: promptRequestId },
        )

        context.sessionBindings.setActiveTurnId({ acpSessionId, turnId: undefined })
        return { ok: true, result }
      } catch (error: unknown) {
        const reason = sanitizePromptFailureReason(error, "session/prompt failed")
        context.sessionBindings.setActiveTurnId({ acpSessionId, turnId: undefined })
        return { ok: false, reason }
      }
    })()

    return { ok: true, turnId, completion }
  }
}

export const registerSessionPromptHandler = (table: AgentMethodTable): void => {
  table.register({
    agentId: ANY_AGENT,
    method: sessionPromptMethod,
    handler: createSessionPromptHandler(),
  })
}
