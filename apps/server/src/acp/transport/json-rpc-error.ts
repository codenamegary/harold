export type AcpJsonRpcError = {
  code: number
  message: string
  data?: unknown
}

const ACP_APPLICATION_ERROR = -32000

export type CreateAcpJsonRpcErrorParams = {
  message: string
  code?: number
  data?: unknown
}

export const createAcpJsonRpcError = (
  messageOrParams: string | CreateAcpJsonRpcErrorParams,
  code = ACP_APPLICATION_ERROR,
): Error & AcpJsonRpcError => {
  if (typeof messageOrParams === "string") {
    const error = new Error(messageOrParams) as Error & AcpJsonRpcError
    error.code = code
    return error
  }

  const error = new Error(messageOrParams.message) as Error & AcpJsonRpcError
  error.code = messageOrParams.code ?? ACP_APPLICATION_ERROR
  if (messageOrParams.data !== undefined) {
    error.data = messageOrParams.data
  }
  return error
}

export const isAcpJsonRpcError = (error: unknown): error is Error & AcpJsonRpcError =>
  error instanceof Error
  && "code" in error
  && typeof error.code === "number"

const isSafeJsonRpcErrorData = (value: unknown): boolean => {
  if (value === null) {
    return true
  }

  const valueType = typeof value
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return true
  }

  if (valueType !== "object") {
    return false
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isSafeJsonRpcErrorData(entry))
  }

  return Object.values(value as Record<string, unknown>).every((entry) =>
    isSafeJsonRpcErrorData(entry)
  )
}

export const readSafeJsonRpcErrorData = (value: unknown): unknown => {
  if (value === undefined || !isSafeJsonRpcErrorData(value)) {
    return undefined
  }

  return value
}
