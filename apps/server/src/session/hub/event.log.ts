import { AgentId } from "contracts/http/agent-settings"
import { SessionStreamServerMessage } from "contracts/http/session.stream"

export type SessionEventLogEntry = Readonly<{
  cursor: string
  message: SessionStreamServerMessage
}>

type SessionLogReference = Readonly<{ agentId: AgentId; sessionId: string }>

/**
 * Bounded per-session log of live stream events. A reconnecting subscriber
 * sends the cursor of the last event it applied; a cursor still inside the
 * window resumes without a `loadSession` replay. A stale or foreign cursor
 * returns null so the caller falls back to a full replay.
 *
 * Each session gets its own random epoch, so cursors never survive a server
 * restart, a deleted session, or a different session id.
 */
export type SessionEventLog = {
  append: (params: SessionLogReference & { message: SessionStreamServerMessage }) => string
  catchUp: (
    params: SessionLogReference & { cursor: string },
  ) => ReadonlyArray<SessionEventLogEntry> | null
  currentCursor: (params: SessionLogReference) => string
  forget: (params: SessionLogReference) => void
}

type SessionLog = {
  readonly epoch: string
  nextSeq: number
  readonly entries: Array<{
    readonly seq: number
    readonly cursor: string
    readonly message: SessionStreamServerMessage
  }>
}

type CreateSessionEventLogParams = Readonly<{
  /** Live events kept per session before the oldest are evicted. */
  capacity?: number
  /** Test seam; defaults to a random UUID per session. */
  createEpoch?: () => string
}>

const sessionKey = (params: SessionLogReference): string => `${params.agentId}:${params.sessionId}`

const cursorFor = (log: SessionLog, seq: number): string => `${log.epoch}:${seq}`

const parseCursor = (log: SessionLog, cursor: string): number | null => {
  const separator = cursor.lastIndexOf(":")
  if (separator < 0) {
    return null
  }
  if (cursor.slice(0, separator) !== log.epoch) {
    return null
  }
  const seqText = cursor.slice(separator + 1)
  if (!/^\d+$/.test(seqText)) {
    return null
  }
  const seq = Number(seqText)
  return Number.isSafeInteger(seq) ? seq : null
}

export const createSessionEventLog = (
  params: CreateSessionEventLogParams = {},
): SessionEventLog => {
  const capacity = Math.max(1, params.capacity ?? 512)
  const createEpoch = params.createEpoch ?? (() => crypto.randomUUID())
  const logs = new Map<string, SessionLog>()

  const ensureLog = (ref: SessionLogReference): SessionLog => {
    const key = sessionKey(ref)
    const existing = logs.get(key)
    if (existing !== undefined) {
      return existing
    }
    const created: SessionLog = {
      epoch: createEpoch(),
      nextSeq: 1,
      entries: [],
    }
    logs.set(key, created)
    return created
  }

  return {
    append: (ref) => {
      const log = ensureLog(ref)
      const seq = log.nextSeq
      log.nextSeq += 1
      const cursor = cursorFor(log, seq)
      log.entries.push({ seq, cursor, message: ref.message })
      while (log.entries.length > capacity) {
        log.entries.shift()
      }
      return cursor
    },
    catchUp: (ref) => {
      const log = logs.get(sessionKey(ref))
      if (log === undefined) {
        return null
      }
      const seq = parseCursor(log, ref.cursor)
      if (seq === null) {
        return null
      }
      const lastSeq = log.nextSeq - 1
      if (seq > lastSeq) {
        return null
      }
      const firstEntry = log.entries[0]
      if (firstEntry !== undefined && seq < firstEntry.seq - 1) {
        return null
      }
      return log.entries
        .filter((entry) => entry.seq > seq)
        .map((entry) => ({ cursor: entry.cursor, message: entry.message }))
    },
    currentCursor: (ref) => {
      const log = ensureLog(ref)
      return cursorFor(log, log.nextSeq - 1)
    },
    forget: (ref) => {
      logs.delete(sessionKey(ref))
    },
  }
}
