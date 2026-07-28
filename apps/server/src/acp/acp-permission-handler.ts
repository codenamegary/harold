import { createAcpJsonRpcError, AcpJsonRpcError } from "./acp-json-rpc-error"

type PermissionOption = {
  optionId?: string
  name?: string
}

type PermissionRequestParams = {
  sessionId?: string
  options?: PermissionOption[]
}

const ACP_APPLICATION_ERROR = -32000

const createAcpError = (message: string, code = ACP_APPLICATION_ERROR): AcpJsonRpcError =>
  createAcpJsonRpcError(message, code)

export const createAcpPermissionHandler = () => ({
  "session/request_permission": async (params: unknown) => {
    const request = params as PermissionRequestParams
    const allowOnce = request.options?.find((option) => option.optionId === "allow-once")

    if (!allowOnce) {
      throw createAcpError("no permissive permission option available")
    }

    return {
      outcome: {
        outcome: "selected",
        optionId: "allow-once",
      },
    }
  },
})
