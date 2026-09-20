import { SessionConfigSchema } from "contracts/http/config.options"
import { sanitizeFailureReason } from "../sanitize.failure.reason"
import { isAcpAuthRequiredError } from "../auth.required"
import { AcpOperationContext } from "../transport/json.rpc.transport"
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

      const configOptions = SessionConfigSchema.safeParse(result.configOptions ?? [])

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
        configOptions: configOptions.success ? configOptions.data : [],
      }
    } catch (error: unknown) {
      return {
        ok: false,
        reason: sanitizeFailureReason(error, "session/new failed"),
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
