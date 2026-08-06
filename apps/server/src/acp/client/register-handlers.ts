import { createAcpFsHandlers } from "./handlers/fs"
import { createAcpPermissionHandler } from "./handlers/permission"
import { createAcpTerminalHandlers } from "./handlers/terminal"
import { AgentProfile } from "../agent-profile"
import { resolveExtensionHandler } from "./extensions/types"
import { isAcpJsonRpcError } from "../transport/json-rpc-error"
import { JsonRpcTransport } from "../transport/json-rpc-transport"
import { SessionBindingRegistry } from "./session-binding-registry"
import { PermissionService } from "../../permission/service"

export type RegisterAcpClientHandlersParams = {
  transport: JsonRpcTransport
  profile: AgentProfile
  sessionBindingRegistry: SessionBindingRegistry
  permissionService: PermissionService
  logUnknownExtension?: (method: string) => void
}

type AcpRequestHandler = (params: unknown) => unknown | Promise<unknown>

const defaultLogUnknownExtension = (method: string) => {
  console.warn(`unknown ACP extension: ${method}`)
}

export const registerAcpClientHandlers = ({
  transport,
  profile,
  sessionBindingRegistry,
  permissionService,
  logUnknownExtension = defaultLogUnknownExtension,
}: RegisterAcpClientHandlersParams) => {
  const fsHandlers = createAcpFsHandlers({ sessionBindingRegistry })
  const terminalHandlers = createAcpTerminalHandlers({ sessionBindingRegistry })
  const permissionHandlers = createAcpPermissionHandler({ permissionService })

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

  Object.entries(profile.extensionHandlers).forEach(([method, handler]) => {
    registerHandler(method, handler)
  })

  transport.onUnhandledRequest(async ({ method, id, params }) => {
    const extensionHandler = resolveExtensionHandler({
      method,
      extensionHandlers: profile.extensionHandlers,
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
