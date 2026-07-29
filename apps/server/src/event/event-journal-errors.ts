import { z } from "zod"
import {
  JOURNAL_SCHEMA_VERSION,
  journalPayloadSchemaByKind,
  JournalRecordKindSchema,
} from "contracts/events/journal-record"

export type EventJournalCorruptionError = {
  kind: "corruption"
  cursor: bigint
  recordKind: z.infer<typeof JournalRecordKindSchema>
  schemaVersion: number
}

export type EventJournalInvalidPayloadError = {
  kind: "invalid_payload"
}

export type EventJournalDuplicateSequenceError = {
  kind: "duplicate_session_sequence"
}

export type EventJournalRepositoryError =
  | EventJournalCorruptionError
  | EventJournalInvalidPayloadError
  | EventJournalDuplicateSequenceError

export type EventJournalRepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: EventJournalRepositoryError }

export const parseJournalPayload = (params: {
  kind: z.infer<typeof JournalRecordKindSchema>
  schemaVersion: number
  payload: unknown
}): EventJournalRepositoryResult<unknown> => {
  if (params.schemaVersion !== JOURNAL_SCHEMA_VERSION) {
    return { ok: false, error: { kind: "invalid_payload" } }
  }

  const kindParse = JournalRecordKindSchema.safeParse(params.kind)
  if (!kindParse.success) {
    return { ok: false, error: { kind: "invalid_payload" } }
  }

  const payloadSchema = journalPayloadSchemaByKind[kindParse.data]
  const parsed = payloadSchema.safeParse(params.payload)
  if (!parsed.success) {
    return { ok: false, error: { kind: "invalid_payload" } }
  }

  return { ok: true, value: parsed.data }
}
