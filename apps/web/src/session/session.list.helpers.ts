import { AcpSession } from "contracts/http/session"

export const RECENT_SESSIONS_LIMIT = 5

export const sortSessionsByUpdatedAtDesc = (
  sessions: ReadonlyArray<AcpSession>,
): AcpSession[] =>
  [...sessions].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )

export const recentSessions = (
  sessions: ReadonlyArray<AcpSession>,
  limit: number = RECENT_SESSIONS_LIMIT,
): AcpSession[] => sortSessionsByUpdatedAtDesc(sessions).slice(0, limit)

export const filterSessionsByTitle = (
  sessions: ReadonlyArray<AcpSession>,
  query: string,
): AcpSession[] => {
  const normalized = query.trim().toLowerCase()
  const sorted = sortSessionsByUpdatedAtDesc(sessions)
  if (normalized === "") {
    return sorted
  }

  return sorted.filter((session) =>
    session.title.toLowerCase().includes(normalized),
  )
}
