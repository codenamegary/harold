import { JOURNAL_SCHEMA_VERSION } from "contracts/events/journal-record"
import { AgentDatabase } from "../persistence/database"
import { EventCommitPublisher } from "../event/commit.publisher"
import { EventJournalRepository } from "../event/journal.repository"
import { runTransactionalJournal } from "../event/journal.transactional"
import { DeviceRepository } from "./repository"

type EmitDeviceLifecycleParams = {
  database: AgentDatabase
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
  deviceRepository: DeviceRepository
  deviceId: string
  kind: "device.connected" | "device.disconnected"
  occurredAt?: string
}

export type EmitDeviceLifecycleResult =
  | { ok: true }
  | { ok: false; reason: "closed_database" | "journal_append_failed" }

const nowIso = (): string => new Date().toISOString()

const isClosedDatabaseError = (error: unknown): boolean =>
  error instanceof RangeError && error.message.includes("closed database")

export const emitDeviceConnectionLifecycle = (
  params: EmitDeviceLifecycleParams,
): EmitDeviceLifecycleResult => {
  const occurredAt = params.occurredAt ?? nowIso()

  try {
    params.deviceRepository.touchLastSeen({
      deviceId: params.deviceId,
      lastSeenAt: occurredAt,
    })

    const result = runTransactionalJournal(
      {
        database: params.database,
        eventJournal: params.eventJournal,
        commitPublisher: params.commitPublisher,
      },
      (txParams) => {
        const appendResult = txParams.append([
          {
            schemaVersion: JOURNAL_SCHEMA_VERSION,
            kind: params.kind,
            occurredAt,
            payload: { deviceId: params.deviceId },
          },
        ])

        if (!appendResult.ok) {
          return appendResult
        }

        return { ok: true, value: undefined, appendedRecords: appendResult.value }
      },
    )

    if (!result.ok) {
      return { ok: false, reason: "journal_append_failed" }
    }

    return { ok: true }
  } catch (error: unknown) {
    if (isClosedDatabaseError(error)) {
      return { ok: false, reason: "closed_database" }
    }
    throw error
  }
}
