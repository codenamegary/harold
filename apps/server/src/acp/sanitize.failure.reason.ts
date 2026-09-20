import { sanitizeAcpRejection } from "./sanitize.error"
import { isAcpJsonRpcError } from "./transport/json.rpc.error"

/**
 * Shared across the supervisor and the per-method ACP handlers: turn any
 * thrown value into a safe, human-readable failure reason.
 */
export const sanitizeFailureReason = (error: unknown, fallback: string): string => {
  if (isAcpJsonRpcError(error)) {
    return sanitizeAcpRejection({
      message: error.message,
      data: error.data,
    })
  }

  const message = error instanceof Error ? error.message : fallback
  return sanitizeAcpRejection({ message })
}
