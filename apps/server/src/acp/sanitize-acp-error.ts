const BEARER_TOKEN_PATTERN = /Bearer\s+\S+/gi
const AUTHORIZATION_HEADER_PATTERN = /authorization:\s*\S+/gi
const API_KEY_PATTERN = /\b(?:api[_-]?key|x-api-key)\s*[:=]\s*\S+/gi
const LONG_KEY_LIKE_BLOB_PATTERN = /\b[A-Za-z0-9+/=_-]{32,}\b/g

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

export const sanitizeAcpErrorMessage = (message: string): string => {
  const trimmed = message.trim()
  if (trimmed.length === 0) {
    return "ACP protocol error"
  }

  return mapTransportFailure(redactSecrets(trimmed))
}
