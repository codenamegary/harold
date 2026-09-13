import { SessionConfigSchema } from "contracts/http/config.options"
import { sanitizeAcpRejection } from "../sanitize.error"
import { isAcpJsonRpcError } from "../transport/json-rpc-error"
import { AcpOperationContext } from "../transport/json-rpc-transport"
import { AgentMethodTable } from "./method.table"
import {
  ANY_AGENT,
  AgentMethodDeclaration,
  AgentMethodHandler,
  RequiredCapabilityPath,
} from "./method"

export const sessionLoadMethod = "session/load"

export const sessionLoadRequires: RequiredCapabilityPath = "loadSession"

export const sessionLoadDeclaration: AgentMethodDeclaration = {
  method: sessionLoadMethod,
  requires: sessionLoadRequires,
  transportKind: "request",
}

const sanitizeLoadFailureReason = (error: unknown, fallback: string): string => {
  if (isAcpJsonRpcError(error)) {
    return sanitizeAcpRejection({
      message: error.message,
      data: error.data,
    })
  }

  const message = error instanceof Error ? error.message : fallback
  return sanitizeAcpRejection({ message })
}

export const createSessionLoadHandler = (): AgentMethodHandler<"session/load"> => {
  return async ({ params, context }) => {
    const { acpSessionId, workspaceCwd, sessionId, workspaceId } = params

    const existingBinding = context.sessionBindings.getBinding(acpSessionId)
    const wasLive =
      existingBinding !== undefined && existingBinding.phase === "live"

    if (!context.supportsCapability(sessionLoadRequires)) {
      return { ok: false, reason: "Agent does not support session/load" }
    }

    context.sessionBindings.unbind({ acpSessionId })
    context.sessionBindings.bind({
      acpSessionId,
      sessionId,
      workspaceId,
      workspaceRoot: workspaceCwd,
      phase: "load_replay",
    })
    context.sessionOwnership.remember({
      agentId: context.agentId,
      acpSessionId,
    })

    const operationContext: AcpOperationContext = {
      sessionId,
      workspaceId,
      phase: "load_replay",
    }

    try {
      const result = await context.transport.request<{
        sessionId: string
        configOptions?: unknown
      }>(
        "session/load",
        {
          sessionId: acpSessionId,
          cwd: workspaceCwd,
          mcpServers: [],
        },
        operationContext,
      )

      const configOptions = SessionConfigSchema.safeParse(result.configOptions ?? [])

      context.sessionBindings.unbind({ acpSessionId: result.sessionId })
      context.sessionBindings.bind({
        acpSessionId: result.sessionId,
        sessionId,
        workspaceId,
        workspaceRoot: workspaceCwd,
        phase: "live",
      })
      context.sessionOwnership.remember({
        agentId: context.agentId,
        acpSessionId: result.sessionId,
      })

      return {
        ok: true,
        acpSessionId: result.sessionId,
        configOptions: configOptions.success ? configOptions.data : [],
      }
    } catch (error: unknown) {
      context.sessionBindings.unbind({ acpSessionId })
      if (wasLive) {
        context.sessionBindings.bind({
          acpSessionId,
          sessionId,
          workspaceId,
          workspaceRoot: workspaceCwd,
          phase: "live",
        })
        return { ok: true, acpSessionId, configOptions: [] }
      }
      return {
        ok: false,
        reason: sanitizeLoadFailureReason(error, "session/load failed"),
      }
    }
  }
}

export const registerSessionLoadHandler = (table: AgentMethodTable): void => {
  table.register({
    agentId: ANY_AGENT,
    method: sessionLoadMethod,
    handler: createSessionLoadHandler(),
  })
}
