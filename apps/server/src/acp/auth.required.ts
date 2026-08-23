import { isAcpJsonRpcError } from "./transport/json-rpc-error"

/** ACP ErrorCode: Authentication required */
export const ACP_AUTH_REQUIRED_CODE = -32000

export const AUTH_GATED_PROMPT_MESSAGE =
  "Agent authentication required. Sign in on the host machine to continue."

export const isAcpAuthRequiredError = (error: unknown): boolean => {
  if (isAcpJsonRpcError(error) && error.code === ACP_AUTH_REQUIRED_CODE) {
    return true
  }

  if (!(error instanceof Error)) {
    return false
  }

  const normalized = error.message.trim().toLowerCase().replace(/_/g, " ")
  return (
    normalized.includes("authentication required")
    || normalized.includes("auth required")
  )
}

export const isAuthRequiredFailureReason = (reason: string): boolean => {
  const normalized = reason.trim().toLowerCase().replace(/_/g, " ")
  return (
    normalized.includes("authentication required")
    || normalized.includes("auth required")
    || reason === AUTH_GATED_PROMPT_MESSAGE
  )
}
