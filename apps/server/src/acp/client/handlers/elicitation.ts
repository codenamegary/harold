import { AgentId } from "contracts/http/agent-settings"
import { readAcpSessionId } from "../session.id.reader"
import { SessionBindingRegistry } from "../session.binding.registry"
import { RequestElicitationFn } from "../../supervisor/models"

export type { RequestElicitationFn }

export type CreateAcpElicitationHandlerParams = {
  agentId: AgentId
  sessionBindingRegistry: SessionBindingRegistry
  requestElicitation: RequestElicitationFn
}

const INVALID_PARAMS = -32602

export const createAcpElicitationHandler = ({
  agentId,
  sessionBindingRegistry,
  requestElicitation,
}: CreateAcpElicitationHandlerParams) => ({
  handleElicitationRequest: async (input: {
    jsonRpcId: string | number
    params: unknown
    respond: (result: unknown) => void
    respondError: (code: number, message: string) => void
  }) => {
    const sessionId = readAcpSessionId(input.params)
    if (sessionId === undefined) {
      input.respondError(INVALID_PARAMS, "elicitation request is not session-scoped")
      return
    }

    if (sessionBindingRegistry.getBinding(sessionId) === undefined) {
      input.respondError(INVALID_PARAMS, "unknown session binding")
      return
    }

    try {
      // The server is a transparent proxy: params and the result are forwarded
      // untouched, and neither the schema nor the answer is validated here.
      const result = await requestElicitation({
        agentId,
        sessionId,
        params: input.params,
        jsonRpcId: input.jsonRpcId,
      })
      input.respond(result)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "elicitation request failed"
      input.respondError(-32000, message)
    }
  },
})

export const readElicitationCompleteId = (params: unknown): string | undefined => {
  if (typeof params !== "object" || params === null) {
    return undefined
  }
  const value = (params as { elicitationId?: unknown }).elicitationId
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export const readCancelledRequestId = (params: unknown): string | number | undefined => {
  if (typeof params !== "object" || params === null) {
    return undefined
  }
  const value =
    (params as { requestId?: unknown; id?: unknown }).requestId ?? (params as { id?: unknown }).id
  return typeof value === "string" || typeof value === "number" ? value : undefined
}
