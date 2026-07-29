import { z } from "zod"
import {
  JOURNAL_SCHEMA_VERSION,
  journalPayloadSchemaByKind,
  JournalPhaseSchema,
} from "contracts/events/journal-record"
import { ParsedJournalRecord } from "./journal.repository"

export const acpJournalKinds = [
  "acp.request",
  "acp.response",
  "acp.notification",
  "acp.permission",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "turn.cancelled",
] as const

export const AcpJournalKindSchema = z.enum(acpJournalKinds)

export type AcpJournalKind = z.infer<typeof AcpJournalKindSchema>

const AcpJournalRecordBaseSchema = z.strictObject({
  cursor: z.bigint(),
  schemaVersion: z.literal(JOURNAL_SCHEMA_VERSION),
  occurredAt: z.string().min(1),
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  turnId: z.string().min(1).nullable(),
  phase: JournalPhaseSchema.nullable(),
})

export const AcpJournalRecordSchema = z.discriminatedUnion("kind", [
  AcpJournalRecordBaseSchema.extend({
    kind: z.literal("turn.started"),
    turnId: z.string().min(1),
    phase: z.null(),
    payload: journalPayloadSchemaByKind["turn.started"],
  }),
  AcpJournalRecordBaseSchema.extend({
    kind: z.literal("turn.completed"),
    turnId: z.string().min(1),
    phase: z.null(),
    payload: journalPayloadSchemaByKind["turn.completed"],
  }),
  AcpJournalRecordBaseSchema.extend({
    kind: z.literal("turn.failed"),
    turnId: z.string().min(1),
    phase: z.null(),
    payload: journalPayloadSchemaByKind["turn.failed"],
  }),
  AcpJournalRecordBaseSchema.extend({
    kind: z.literal("turn.cancelled"),
    turnId: z.string().min(1),
    phase: z.null(),
    payload: journalPayloadSchemaByKind["turn.cancelled"],
  }),
  AcpJournalRecordBaseSchema.extend({
    kind: z.literal("acp.request"),
    phase: JournalPhaseSchema,
    payload: journalPayloadSchemaByKind["acp.request"],
  }),
  AcpJournalRecordBaseSchema.extend({
    kind: z.literal("acp.response"),
    phase: JournalPhaseSchema,
    payload: journalPayloadSchemaByKind["acp.response"],
  }),
  AcpJournalRecordBaseSchema.extend({
    kind: z.literal("acp.notification"),
    phase: JournalPhaseSchema,
    payload: journalPayloadSchemaByKind["acp.notification"],
  }),
  AcpJournalRecordBaseSchema.extend({
    kind: z.literal("acp.permission"),
    turnId: z.string().min(1),
    phase: JournalPhaseSchema,
    payload: journalPayloadSchemaByKind["acp.permission"],
  }),
])

export type AcpJournalRecord = z.infer<typeof AcpJournalRecordSchema>

export const isAcpJournalKind = (kind: string): kind is AcpJournalKind =>
  (acpJournalKinds as ReadonlyArray<string>).includes(kind)

export const parseAcpJournalRecord = (record: ParsedJournalRecord): AcpJournalRecord =>
  AcpJournalRecordSchema.parse({
    cursor: record.cursor,
    schemaVersion: record.schemaVersion,
    occurredAt: record.occurredAt,
    kind: record.kind,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    turnId: record.turnId,
    phase: record.phase,
    payload: record.payload,
  })

export const parseAcpJournalRecords = (
  records: ReadonlyArray<ParsedJournalRecord>,
): AcpJournalRecord[] => records.filter((record) => isAcpJournalKind(record.kind)).map(parseAcpJournalRecord)
