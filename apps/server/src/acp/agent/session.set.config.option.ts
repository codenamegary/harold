import { SessionConfigSchema } from "contracts/http/config.options"
import { sanitizeFailureReason } from "../sanitize.failure.reason"
import { isAcpJsonRpcError } from "../transport/json.rpc.error"
import {
  ANY_AGENT,
  AgentMethodDeclaration,
  AgentMethodHandler,
  AgentMethodTransportKind,
} from "./method"
import { AgentMethodTable } from "./method.table"
import { AcpSetConfigOptionResult } from "../supervisor/models"

export const sessionSetConfigOptionMethod = "session/set_config_option"

export const sessionSetConfigOptionRequires = null

export const sessionSetConfigOptionTransportKind: AgentMethodTransportKind = "request"

export const sessionSetConfigOptionDeclaration: AgentMethodDeclaration = {
  method: sessionSetConfigOptionMethod,
  requires: sessionSetConfigOptionRequires,
  transportKind: sessionSetConfigOptionTransportKind,
}

const classifySetConfigOptionFailure = (error: unknown): AcpSetConfigOptionResult => {
  const reason = sanitizeFailureReason(error, "session/set_config_option failed")
  if (isAcpJsonRpcError(error)) {
    if (error.code === -32601) {
      return { ok: false, kind: "unsupported", reason }
    }
    if (error.code === -32602) {
      return { ok: false, kind: "invalid-option", reason }
    }
    if (
      error.code === -32002 ||
      /session .*not found/i.test(error.message) ||
      /unknown session/i.test(error.message)
    ) {
      return { ok: false, kind: "unknown-session", reason }
    }
    return { ok: false, kind: "error", reason }
  }

  return { ok: false, kind: "error", reason }
}

export const createSessionSetConfigOptionHandler =
  (): AgentMethodHandler<"session/set_config_option"> => {
    return async ({ params, context }) => {
      const { acpSessionId, configId, value } = params

      try {
        const result = await context.transport.request<{
          configOptions?: unknown
        }>(sessionSetConfigOptionMethod, {
          sessionId: acpSessionId,
          configId,
          value,
        })

        const parsed = SessionConfigSchema.safeParse(result.configOptions)
        if (!parsed.success) {
          return {
            ok: false,
            kind: "error",
            reason: "Agent returned an invalid config state",
          }
        }

        return { ok: true, configOptions: parsed.data }
      } catch (error: unknown) {
        return classifySetConfigOptionFailure(error)
      }
    }
  }

export const registerSessionSetConfigOptionHandler = (table: AgentMethodTable): void => {
  table.register({
    agentId: ANY_AGENT,
    method: sessionSetConfigOptionMethod,
    handler: createSessionSetConfigOptionHandler(),
  })
}
