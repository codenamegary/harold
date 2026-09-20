import { createAcpJsonRpcError } from "../../transport/json.rpc.error"

export type ExtensionHandler = (params: unknown) => unknown

export type ExtensionHandlers = Record<string, ExtensionHandler>

export const createUnknownExtensionHandler =
  (method: string): ExtensionHandler =>
  () => {
    throw createAcpJsonRpcError(`unknown extension: ${method}`, -32601)
  }

export const resolveExtensionHandler = (params: {
  method: string
  extensionHandlers: ExtensionHandlers
  onUnknown: (method: string) => void
}): ExtensionHandler | undefined => {
  const handler = params.extensionHandlers[params.method]
  if (handler) {
    return handler
  }

  if (!params.method.includes("/")) {
    return undefined
  }

  params.onUnknown(params.method)
  return createUnknownExtensionHandler(params.method)
}
