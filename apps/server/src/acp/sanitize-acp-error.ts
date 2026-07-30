const BEARER_TOKEN_PATTERN = /Bearer\s+\S+/gi
const AUTHORIZATION_HEADER_PATTERN = /authorization:\s*\S+/gi
const API_KEY_PATTERN = /\b(?:api[_-]?key|x-api-key)\s*[:=]\s*\S+/gi
const LONG_KEY_LIKE_BLOB_PATTERN = /\b[A-Za-z0-9+/=_-]{32,}\b/g

export const ACTIONABLE_SESSION_LOAD_DETAIL =
  "Cursor could not load this session. Start a new session."

const transportFailurePhrases: ReadonlyArray<{ pattern: RegExp; phrase: string }> = [
  { pattern: /ECONNREFUSED/i, phrase: "ACP transport connection refused" },
  { pattern: /ECONNRESET/i, phrase: "ACP transport connection reset" },
  { pattern: /ETIMEDOUT/i, phrase: "ACP transport timed out" },
  { pattern: /EPIPE/i, phrase: "ACP transport pipe closed" },
  { pattern: /broken pipe/i, phrase: "ACP transport pipe closed" },
  { pattern: /JSON\.parse/i, phrase: "ACP transport returned invalid JSON" },
]

const redactSecrets = (message: string): string =>
  message
    .replace(BEARER_TOKEN_PATTERN, "Bearer [redacted]")
    .replace(AUTHORIZATION_HEADER_PATTERN, "authorization: [redacted]")
    .replace(API_KEY_PATTERN, "api-key: [redacted]")
    .replace(LONG_KEY_LIKE_BLOB_PATTERN, "[redacted]")

const mapTransportFailure = (message: string): string => {
  const match = transportFailurePhrases.find(({ pattern }) => pattern.test(message))
  return match?.phrase ?? message
}

const normalizeRejectionSignal = (text: string): string =>
  text.trim().toLowerCase().replace(/_/g, "-")

const isUnhelpfulRejectionSignal = (text: string): boolean => {
  const normalized = normalizeRejectionSignal(text)
  return (
    normalized === "invalid params"
    || normalized === "session-not-found"
    || normalized === "session not found"
  )
}

const readDataMessage = (data: unknown): string | undefined => {
  if (typeof data === "string") {
    const trimmed = data.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return undefined
  }

  if (!("message" in data) || typeof data.message !== "string") {
    return undefined
  }

  const trimmed = data.message.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export type SanitizeAcpRejectionParams = {
  message: string
  data?: unknown
}

export const sanitizeAcpErrorMessage = (message: string): string => {
  const trimmed = message.trim()
  if (trimmed.length === 0) {
    return "ACP protocol error"
  }

  if (isUnhelpfulRejectionSignal(trimmed)) {
    return ACTIONABLE_SESSION_LOAD_DETAIL
  }

  return mapTransportFailure(redactSecrets(trimmed))
}

export const sanitizeAcpRejection = (params: SanitizeAcpRejectionParams): string => {
  const dataMessage = readDataMessage(params.data)
  if (dataMessage !== undefined && !isUnhelpfulRejectionSignal(dataMessage)) {
    return sanitizeAcpErrorMessage(dataMessage)
  }

  return sanitizeAcpErrorMessage(params.message)
}
