import { AgentId } from "contracts/http/agent-settings"
import { RequestExtensionRpcFn } from "../supervisor/models"
import {
  createAcpElicitationHandler,
  readCancelledRequestId,
  readElicitationCompleteId,
  RequestElicitationFn,
} from "./handlers/elicitation"
import { createAcpFsHandlers } from "./handlers/fs"
import { createAcpPermissionHandler } from "./handlers/permission"
import { createAcpTerminalHandlers } from "./handlers/terminal"
import { ExtensionHandlers, resolveExtensionHandler } from "./extensions/types"
import { isAcpJsonRpcError } from "../transport/json.rpc.error"
import { JsonRpcTransport } from "../transport/json.rpc.transport"
import { SessionBindingRegistry } from "./session.binding.registry"

export type RegisterAcpClientHandlersParams = {
  transport: JsonRpcTransport
  agentId: AgentId
  sessionBindingRegistry: SessionBindingRegistry
  requestPermission: (input: {
    agentId: AgentId
    sessionId: string
    params: unknown
  }) => Promise<unknown>
  requestElicitation?: RequestElicitationFn
  onElicitationComplete?: (input: { agentId: AgentId; elicitationId: string }) => void
  onElicitationCancel?: (input: { agentId: AgentId; jsonRpcId: string | number }) => void
  extensionHandlers: ExtensionHandlers
  logUnknownExtension?: (method: string) => void
}

type AcpRequestHandler = (params: unknown) => unknown

const defaultLogUnknownExtension = (method: string) => {
  console.warn(`unknown ACP extension: ${method}`)
}

export const registerAcpClientHandlers = ({
  transport,
  agentId,
  sessionBindingRegistry,
  requestPermission,
  requestElicitation = createUnavailableRequestElicitation(),
  onElicitationComplete = () => undefined,
  onElicitationCancel = () => undefined,
  extensionHandlers,
  logUnknownExtension = defaultLogUnknownExtension,
}: RegisterAcpClientHandlersParams) => {
  const fsHandlers = createAcpFsHandlers({ sessionBindingRegistry })
  const terminalHandlers = createAcpTerminalHandlers({ sessionBindingRegistry })
  const permissionHandlers = createAcpPermissionHandler({
    agentId,
    requestPermission,
  })
  const elicitationHandler = createAcpElicitationHandler({
    agentId,
    sessionBindingRegistry,
    requestElicitation,
  })

  const coreHandlers: Record<string, AcpRequestHandler> = {
    ...fsHandlers,
    ...terminalHandlers,
  }

  const registerHandler = (method: string, handler: AcpRequestHandler) => {
    transport.onRequest(method, async ({ id, params }) => {
      try {
        const result = await handler(params)
        transport.respond(id, result)
      } catch (error: unknown) {
        if (isAcpJsonRpcError(error)) {
          transport.respondError(id, error.code, error.message)
          return
        }

        const message = error instanceof Error ? error.message : "ACP client handler failed"
        transport.respondError(id, -32000, message)
      }
    })
  }

  Object.entries(coreHandlers).forEach(([method, handler]) => {
    registerHandler(method, handler)
  })

  transport.onRequest("session/request_permission", async ({ id, params }) => {
    await permissionHandlers.handlePermissionRequest({
      jsonRpcId: id,
      params,
      respond: (result) => transport.respond(id, result),
      respondError: (code, message) => transport.respondError(id, code, message),
    })
  })

  transport.onRequest("elicitation/create", async ({ id, params }) => {
    await elicitationHandler.handleElicitationRequest({
      jsonRpcId: id,
      params,
      respond: (result) => transport.respond(id, result),
      respondError: (code, message) => transport.respondError(id, code, message),
    })
  })

  transport.onNotification("elicitation/complete", (params) => {
    const elicitationId = readElicitationCompleteId(params)
    if (elicitationId === undefined) {
      return
    }
    onElicitationComplete({ agentId, elicitationId })
  })

  transport.onNotification("$/cancel_request", (params) => {
    const jsonRpcId = readCancelledRequestId(params)
    if (jsonRpcId === undefined) {
      return
    }
    onElicitationCancel({ agentId, jsonRpcId })
  })

  Object.entries(extensionHandlers).forEach(([method, handler]) => {
    registerHandler(method, handler)
  })

  transport.onUnhandledRequest(async ({ method, id, params }) => {
    const extensionHandler = resolveExtensionHandler({
      method,
      extensionHandlers,
      onUnknown: logUnknownExtension,
    })

    if (!extensionHandler) {
      transport.respondError(id, -32601, `method not found: ${method}`)
      return
    }

    try {
      const result = await extensionHandler(params)
      transport.respond(id, result)
    } catch (error: unknown) {
      if (isAcpJsonRpcError(error)) {
        transport.respondError(id, error.code, error.message)
        return
      }

      const message = error instanceof Error ? error.message : "ACP extension handler failed"
      transport.respondError(id, -32000, message)
    }
  })
}

export const createUnavailableRequestPermission =
  (): RegisterAcpClientHandlersParams["requestPermission"] => async () => {
    throw new Error("permission service unavailable")
  }

export const createUnavailableRequestElicitation = (): RequestElicitationFn => async () => {
  throw new Error("elicitation service unavailable")
}

export const createUnavailableRequestExtensionRpc = (): RequestExtensionRpcFn => async () => {
  throw new Error("extension request unavailable")
}
