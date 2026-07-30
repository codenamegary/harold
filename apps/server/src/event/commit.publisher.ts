import { ParsedJournalRecord } from "./journal.repository"
import { EventStreamFilters } from "./stream.handshake"

export type RecordCommitListener = (record: ParsedJournalRecord) => void

type SubscriberEntry = {
  filters: EventStreamFilters | undefined
  listener: RecordCommitListener
}

export type EventCommitPublisher = {
  subscribe: (
    filtersOrListener: EventStreamFilters | RecordCommitListener,
    maybeListener?: RecordCommitListener,
  ) => () => void
  publish: (records: ParsedJournalRecord[]) => void
}

const recordMatchesFilters = (
  record: ParsedJournalRecord,
  filters: EventStreamFilters,
): boolean => {
  if (filters.workspaceId !== undefined && record.workspaceId !== filters.workspaceId) {
    return false
  }

  if (filters.sessionId !== undefined && record.sessionId !== filters.sessionId) {
    return false
  }

  return true
}

const matchesSubscriber = (record: ParsedJournalRecord, entry: SubscriberEntry): boolean =>
  entry.filters === undefined ? true : recordMatchesFilters(record, entry.filters)

export const createEventCommitPublisher = (): EventCommitPublisher => {
  const subscribers = new Set<SubscriberEntry>()

  const subscribe = (
    filtersOrListener: EventStreamFilters | RecordCommitListener,
    maybeListener?: RecordCommitListener,
  ) => {
    const entry: SubscriberEntry =
      typeof filtersOrListener === "function"
        ? { filters: undefined, listener: filtersOrListener }
        : {
            filters: filtersOrListener,
            listener: maybeListener as RecordCommitListener,
          }

    subscribers.add(entry)
    return () => {
      subscribers.delete(entry)
    }
  }

  const publish = (records: ParsedJournalRecord[]) => {
    if (records.length === 0) {
      return
    }

    records.forEach((record) => {
      subscribers.forEach((entry) => {
        if (matchesSubscriber(record, entry)) {
          entry.listener(record)
        }
      })
    })
  }

  return { subscribe, publish }
}
