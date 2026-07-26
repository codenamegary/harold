const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export const formatRelativeLastUsed = (
  lastUsedAt: string,
  createdAt: string,
  nowMs: number,
): string => {
  if (lastUsedAt === createdAt) {
    return "Never"
  }

  const lastUsedMs = new Date(lastUsedAt).getTime()
  const elapsedMs = Math.max(0, nowMs - lastUsedMs)

  if (elapsedMs < MINUTE_MS) {
    return "Just now"
  }

  if (elapsedMs < HOUR_MS) {
    const minutes = Math.floor(elapsedMs / MINUTE_MS)
    return `${minutes}m ago`
  }

  if (elapsedMs < DAY_MS) {
    const hours = Math.floor(elapsedMs / HOUR_MS)
    return `${hours}h ago`
  }

  const days = Math.floor(elapsedMs / DAY_MS)
  return `${days}d ago`
}
