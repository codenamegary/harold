import { z } from "zod"
import {
  JOURNAL_SCHEMA_VERSION,
  journalPayloadSchemaByKind,
} from "contracts/events/journal-record"
import { ParsedJournalRecord } from "./journal.repository"

export const lifecycleKinds = [
  "server.status",
  "workspace.changed",
  "session.created",
  "session.state",
] as const

export const LifecycleKindSchema = z.enum(lifecycleKinds)

export type LifecycleKind = z.infer<typeof LifecycleKindSchema>

const LifecycleJournalRecordBaseSchema = z.strictObject({
  cursor: z.bigint(),
  schemaVersion: z.literal(JOURNAL_SCHEMA_VERSION),
  occurredAt: z.string().min(1),
})

const ScopeIdSchema = z.string().min(1)

export const LifecycleJournalRecordSchema = z.discriminatedUnion("kind", [
  LifecycleJournalRecordBaseSchema.extend({
    kind: z.literal("server.status"),
    workspaceId: z.null(),
    sessionId: z.null(),
    payload: journalPayloadSchemaByKind["server.status"],
  }),
  LifecycleJournalRecordBaseSchema.extend({
    kind: z.literal("workspace.changed"),
    workspaceId: ScopeIdSchema,
    sessionId: z.null(),
    payload: journalPayloadSchemaByKind["workspace.changed"],
  }),
  LifecycleJournalRecordBaseSchema.extend({
    kind: z.literal("session.created"),
    workspaceId: ScopeIdSchema,
    sessionId: ScopeIdSchema,
    payload: journalPayloadSchemaByKind["session.created"],
  }),
  LifecycleJournalRecordBaseSchema.extend({
    kind: z.literal("session.state"),
    workspaceId: ScopeIdSchema,
    sessionId: ScopeIdSchema,
    payload: journalPayloadSchemaByKind["session.state"],
  }),
])

export type LifecycleJournalRecord = z.infer<typeof LifecycleJournalRecordSchema>

export const parseLifecycleJournalRecord = (
  record: ParsedJournalRecord,
): LifecycleJournalRecord =>
  LifecycleJournalRecordSchema.parse({
    cursor: record.cursor,
    schemaVersion: record.schemaVersion,
    occurredAt: record.occurredAt,
    kind: record.kind,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    payload: record.payload,
  })

export const parseLifecycleJournalRecords = (
  records: ReadonlyArray<ParsedJournalRecord>,
): LifecycleJournalRecord[] => records.map(parseLifecycleJournalRecord)
