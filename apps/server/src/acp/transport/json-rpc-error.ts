export type AcpJsonRpcError = {
  code: number
  message: string
}

const ACP_APPLICATION_ERROR = -32000

export const createAcpJsonRpcError = (
  message: string,
  code = ACP_APPLICATION_ERROR,
): Error & AcpJsonRpcError => {
  const error = new Error(message) as Error & AcpJsonRpcError
  error.code = code
  return error
}

export const isAcpJsonRpcError = (error: unknown): error is Error & AcpJsonRpcError =>
  error instanceof Error
  && "code" in error
  && typeof error.code === "number"
