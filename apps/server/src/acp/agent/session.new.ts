import { SessionConfigSchema } from "contracts/http/config-options"
import { sanitizeAcpRejection } from "../sanitize.error"
import { isAcpAuthRequiredError } from "../auth.required"
import { isAcpJsonRpcError } from "../transport/json-rpc-error"
import { AcpOperationContext } from "../transport/json-rpc-transport"
import { AgentMethodTable } from "./method.table"
import {
  ANY_AGENT,
  AgentMethodDeclaration,
  AgentMethodHandler,
  AgentMethodTransportKind,
} from "./method"

export const sessionNewMethod = "session/new"

export const sessionNewRequires = null

export const sessionNewTransportKind: AgentMethodTransportKind = "request"

export const sessionNewDeclaration: AgentMethodDeclaration = {
  method: sessionNewMethod,
  requires: sessionNewRequires,
  transportKind: sessionNewTransportKind,
}

const sanitizeNewFailureReason = (error: unknown, fallback: string): string => {
  if (isAcpJsonRpcError(error)) {
    return sanitizeAcpRejection({
      message: error.message,
      data: error.data,
    })
  }

  const message = error instanceof Error ? error.message : fallback
  return sanitizeAcpRejection({ message })
}

export const createSessionNewHandler = (): AgentMethodHandler<"session/new"> => {
  return async ({ params, context }) => {
    const { workspaceCwd, sessionId, workspaceId, discoverOnCreate } = params

    const operationContext: AcpOperationContext | undefined =
      discoverOnCreate === true
        ? undefined
        : {
            sessionId,
            workspaceId,
            phase: "live",
          }

    try {
      const result = await context.transport.request<{
        sessionId: string
        configOptions?: unknown
      }>(
        "session/new",
        {
          cwd: workspaceCwd,
          mcpServers: [],
        },
        operationContext,
      )

      const configOptions = SessionConfigSchema.safeParse(result.configOptions)
      const validatedConfigOptions = configOptions.success ? configOptions.data : undefined

      context.sessionOwnership.remember({
        agentId: context.agentId,
        acpSessionId: result.sessionId,
      })

      const bindingSessionId = discoverOnCreate === true ? result.sessionId : sessionId
      const bindingWorkspaceId = discoverOnCreate === true ? result.sessionId : workspaceId

      context.sessionBindings.bind({
        acpSessionId: result.sessionId,
        sessionId: bindingSessionId,
        workspaceId: bindingWorkspaceId,
        workspaceRoot: workspaceCwd,
        phase: "live",
      })

      if (discoverOnCreate === true) {
        context.onSessionDiscovered({
          agentId: context.agentId,
          sessionId: result.sessionId,
          cwd: workspaceCwd,
        })
      }

      return {
        ok: true,
        acpSessionId: result.sessionId,
        ...(validatedConfigOptions === undefined ? {} : { configOptions: validatedConfigOptions }),
      }
    } catch (error: unknown) {
      return {
        ok: false,
        reason: sanitizeNewFailureReason(error, "session/new failed"),
        ...(isAcpAuthRequiredError(error) ? { authRequired: true } : {}),
      }
    }
  }
}

export const registerSessionNewHandler = (table: AgentMethodTable): void => {
  table.register({
    agentId: ANY_AGENT,
    method: sessionNewMethod,
    handler: createSessionNewHandler(),
  })
}
