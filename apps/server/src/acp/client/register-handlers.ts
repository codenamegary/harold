import { createAcpFsHandlers } from "./handlers/fs"
import { createAcpPermissionHandler } from "./handlers/permission"
import { createAcpTerminalHandlers } from "./handlers/terminal"
import { AgentProfile } from "../agent-profile"
import { resolveExtensionHandler } from "./extensions/types"
import { isAcpJsonRpcError } from "../transport/json-rpc-error"
import { JsonRpcTransport } from "../transport/json-rpc-transport"
import { SessionBindingRegistry } from "./session-binding-registry"

export type RegisterAcpClientHandlersParams = {
  transport: JsonRpcTransport
  profile: AgentProfile
  sessionBindingRegistry: SessionBindingRegistry
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
  logUnknownExtension = defaultLogUnknownExtension,
}: RegisterAcpClientHandlersParams) => {
  const fsHandlers = createAcpFsHandlers({ sessionBindingRegistry })
  const terminalHandlers = createAcpTerminalHandlers({ sessionBindingRegistry })
  const permissionHandlers = createAcpPermissionHandler()

  const coreHandlers: Record<string, AcpRequestHandler> = {
    ...fsHandlers,
    ...terminalHandlers,
    ...permissionHandlers,
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
