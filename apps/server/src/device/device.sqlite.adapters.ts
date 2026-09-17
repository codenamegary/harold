import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"
import { Device, DeviceState, ListDevicesQuery } from "contracts/http/device"
import { PairingCodeState } from "contracts/http/pairing-code"
import { AgentDatabase, DbExecutor } from "../persistence/database"
import { devices } from "../persistence/schema/devices"
import { pairingCodes } from "../persistence/schema/pairing-codes"
import { createDeviceId } from "./device.create.id"
import { createPairingId } from "./device.create.pairing.id"
import { DeviceError } from "./device.errors"
import { isDeviceOnline } from "./device.presence"
import {
  decodeDevicePageCursor,
  DevicePageCursorPayload,
  encodeDevicePageCursor,
} from "./device.page.cursor"
import {
  ClaimPairingCodeRow,
  ClaimPairingCodeRowInput,
  DeviceListResult,
  FindDeviceByCredentialHash,
  GetPairingCodeById,
  InsertPairingCode,
  InsertPairingCodeInput,
  InsertProbeDevice,
  InsertProbeDeviceInput,
  ListActivePairingCodes,
  ListDevices,
  ListPairingCodesByStates,
  MarkExpiredActiveBefore,
  MarkPairingCodeExpired,
  PairingCodeSnapshot,
  RevokeDeviceRow,
  RevokeDeviceRowInput,
  TouchDeviceLastSeen,
} from "./device.ports"

type DeviceRow = typeof devices.$inferSelect
type PairingCodeRow = typeof pairingCodes.$inferSelect

const rowToPairingCodeSnapshot = (row: PairingCodeRow): PairingCodeSnapshot => ({
  id: row.id,
  codeHash: row.codeHash,
  state: row.state as PairingCodeState,
  expiresAt: row.expiresAt,
})

const rowToDevice = (row: DeviceRow): Device => {
  if (row.revokedAt !== null) {
    return {
      id: row.id,
      name: row.name,
      platform: row.platform,
      state: "revoked",
      pairedAt: row.pairedAt,
      lastSeenAt: row.lastSeenAt,
    }
  }

  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    state: isDeviceOnline(row.id) ? "online" : "offline",
    pairedAt: row.pairedAt,
    lastSeenAt: row.lastSeenAt,
  }
}

export const makeInsertPairingCode =
  (database: AgentDatabase): InsertPairingCode =>
  (input: InsertPairingCodeInput) => {
    const id = createPairingId()

    database.db
      .insert(pairingCodes)
      .values({
        id,
        codeHash: input.codeHash,
        state: "active",
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        claimedAt: null,
        deviceId: null,
      })
      .run()

    return {
      ok: true,
      value: {
        id,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        state: "active",
      },
    }
  }

export const makeListActivePairingCodes =
  (database: AgentDatabase): ListActivePairingCodes =>
  () =>
    database.db
      .select()
      .from(pairingCodes)
      .where(eq(pairingCodes.state, "active"))
      .all()
      .map(rowToPairingCodeSnapshot)

export const makeListPairingCodesByStates =
  (database: AgentDatabase): ListPairingCodesByStates =>
  (states: ReadonlyArray<PairingCodeState>) => {
    if (states.length === 0) {
      return []
    }

    // Hash-only storage: claim loads candidate rows and verifies Argon2id until a match.
    return database.db
      .select()
      .from(pairingCodes)
      .where(inArray(pairingCodes.state, [...states]))
      .all()
      .map(rowToPairingCodeSnapshot)
  }

export const makeMarkExpiredActiveBefore =
  (database: AgentDatabase): MarkExpiredActiveBefore =>
  (input: { nowIso: string }) => {
    database.db
      .update(pairingCodes)
      .set({ state: "expired" })
      .where(
        and(eq(pairingCodes.state, "active"), lte(pairingCodes.expiresAt, input.nowIso)),
      )
      .run()
  }

export const makeMarkPairingCodeExpired =
  (database: AgentDatabase): MarkPairingCodeExpired =>
  (input: { id: string }) => {
    database.db
      .update(pairingCodes)
      .set({ state: "expired" })
      .where(and(eq(pairingCodes.id, input.id), eq(pairingCodes.state, "active")))
      .run()
  }

export const makeGetPairingCodeById =
  (database: AgentDatabase): GetPairingCodeById =>
  (id: string) => {
    const row = database.db
      .select()
      .from(pairingCodes)
      .where(eq(pairingCodes.id, id))
      .get()
    return row === undefined ? undefined : rowToPairingCodeSnapshot(row)
  }

export const makeClaimPairingCodeRow =
  (database: AgentDatabase): ClaimPairingCodeRow =>
  (input: ClaimPairingCodeRowInput) => {
    return database.db.transaction((tx): { ok: true; value: Device } | { ok: false; error: DeviceError } => {
      const deviceId = createDeviceId()

      const current = tx
        .select()
        .from(pairingCodes)
        .where(
          and(
            eq(pairingCodes.id, input.pairingCodeId),
            eq(pairingCodes.state, "active"),
            gt(pairingCodes.expiresAt, input.pairedAt),
          ),
        )
        .get()

      if (current === undefined) {
        return { ok: false, error: { kind: "pairing_code_race" } }
      }

      tx.insert(devices)
        .values({
          id: deviceId,
          name: input.name,
          platform: input.platform,
          credentialHash: input.credentialHash,
          pairedAt: input.pairedAt,
          lastSeenAt: input.pairedAt,
          revokedAt: null,
        })
        .run()

      const claimed = tx
        .update(pairingCodes)
        .set({
          state: "claimed",
          claimedAt: input.pairedAt,
          deviceId,
        })
        .where(
          and(
            eq(pairingCodes.id, input.pairingCodeId),
            eq(pairingCodes.state, "active"),
            gt(pairingCodes.expiresAt, input.pairedAt),
          ),
        )
        .returning({ id: pairingCodes.id })
        .all()

      if (claimed.length === 0) {
        return { ok: false, error: { kind: "pairing_code_race" } }
      }

      const row = tx.select().from(devices).where(eq(devices.id, deviceId)).get()

      if (row === undefined) {
        return { ok: false, error: { kind: "pairing_code_race" } }
      }

      return { ok: true, value: rowToDevice(row) }
    })
  }

export const makeInsertProbeDevice =
  (database: AgentDatabase): InsertProbeDevice =>
  (input: InsertProbeDeviceInput) => {
    const deviceId = createDeviceId()

    database.db
      .insert(devices)
      .values({
        id: deviceId,
        name: input.name,
        platform: input.platform,
        credentialHash: input.credentialHash,
        pairedAt: input.pairedAt,
        lastSeenAt: input.pairedAt,
        revokedAt: null,
      })
      .run()

    const row = database.db.select().from(devices).where(eq(devices.id, deviceId)).get()
    if (row === undefined) {
      throw new Error("probe device insert did not persist")
    }

    return { ok: true, value: rowToDevice(row) }
  }

export const makeFindDeviceByCredentialHash =
  (database: AgentDatabase): FindDeviceByCredentialHash =>
  (credentialHash: string) => {
    const row = database.db
      .select()
      .from(devices)
      .where(eq(devices.credentialHash, credentialHash))
      .get()
    return row === undefined ? undefined : { id: row.id, revokedAt: row.revokedAt }
  }

export const makeTouchDeviceLastSeen =
  (database: AgentDatabase): TouchDeviceLastSeen =>
  (input: { deviceId: string; lastSeenAt: string }) => {
    database.db
      .update(devices)
      .set({ lastSeenAt: input.lastSeenAt })
      .where(and(eq(devices.id, input.deviceId), isNull(devices.revokedAt)))
      .run()
  }

const clearPairingCodeDeviceRefs = (
  executor: DbExecutor,
  deviceId: string,
): void => {
  executor
    .update(pairingCodes)
    .set({ deviceId: null })
    .where(eq(pairingCodes.deviceId, deviceId))
    .run()
}

const deleteDeviceRow = (
  executor: DbExecutor,
  deviceId: string,
): { ok: true } | { ok: false; error: DeviceError } => {
  const row = executor.select().from(devices).where(eq(devices.id, deviceId)).get()

  if (row === undefined) {
    return { ok: false, error: { kind: "device_not_found" } }
  }

  executor.delete(devices).where(eq(devices.id, deviceId)).run()
  return { ok: true }
}

export const makeRevokeDeviceRow =
  (database: AgentDatabase): RevokeDeviceRow =>
  (input: RevokeDeviceRowInput) => {
    return database.db.transaction((tx): { ok: true; value: { newlyRevoked: boolean } } | { ok: false; error: DeviceError } => {
      const row = tx.select().from(devices).where(eq(devices.id, input.deviceId)).get()

      if (row === undefined) {
        return { ok: false, error: { kind: "device_not_found" } }
      }

      let newlyRevoked = false

      if (row.revokedAt === null) {
        tx.update(devices)
          .set({ revokedAt: input.revokedAt })
          .where(and(eq(devices.id, input.deviceId), isNull(devices.revokedAt)))
          .run()
        newlyRevoked = true
      }

      if (input.hardDelete) {
        clearPairingCodeDeviceRefs(tx, input.deviceId)
        const deleted = deleteDeviceRow(tx, input.deviceId)
        if (!deleted.ok) {
          return deleted
        }
      }

      return { ok: true, value: { newlyRevoked } }
    })
  }

const getDeviceRowById = (database: AgentDatabase, id: string): DeviceRow | undefined =>
  database.db.select().from(devices).where(eq(devices.id, id)).get()

const compareDevices = (params: { left: DeviceRow; right: DeviceRow }): number => {
  const { left, right } = params
  if (left.pairedAt !== right.pairedAt) {
    return left.pairedAt < right.pairedAt ? 1 : -1
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

const conditionAfter = (row: DeviceRow) =>
  or(
    lt(devices.pairedAt, row.pairedAt),
    and(eq(devices.pairedAt, row.pairedAt), gt(devices.id, row.id)),
  )

const conditionBefore = (row: DeviceRow) =>
  or(
    gt(devices.pairedAt, row.pairedAt),
    and(eq(devices.pairedAt, row.pairedAt), lt(devices.id, row.id)),
  )

const hasMoreAfter = (database: AgentDatabase, row: DeviceRow): boolean =>
  database.db
    .select()
    .from(devices)
    .where(conditionAfter(row))
    .orderBy(desc(devices.pairedAt), asc(devices.id))
    .limit(1)
    .get() !== undefined

const hasMoreBefore = (database: AgentDatabase, row: DeviceRow): boolean =>
  database.db
    .select()
    .from(devices)
    .where(conditionBefore(row))
    .orderBy(asc(devices.pairedAt), desc(devices.id))
    .limit(1)
    .get() !== undefined

const buildPageCursors = (database: AgentDatabase, rows: DeviceRow[]) => {
  if (rows.length === 0) {
    return { nextCursor: undefined, previousCursor: undefined }
  }

  const first = rows[0]
  const last = rows[rows.length - 1]

  return {
    nextCursor:
      last !== undefined && hasMoreAfter(database, last)
        ? encodeDevicePageCursor({ id: last.id, edge: "after" })
        : undefined,
    previousCursor:
      first !== undefined && hasMoreBefore(database, first)
        ? encodeDevicePageCursor({ id: first.id, edge: "before" })
        : undefined,
  }
}

const listForward = (
  database: AgentDatabase,
  limit: number,
  cursorRow?: DeviceRow,
): DeviceRow[] => {
  if (cursorRow === undefined) {
    return database.db
      .select()
      .from(devices)
      .orderBy(desc(devices.pairedAt), asc(devices.id))
      .limit(limit)
      .all()
  }

  return database.db
    .select()
    .from(devices)
    .where(conditionAfter(cursorRow))
    .orderBy(desc(devices.pairedAt), asc(devices.id))
    .limit(limit)
    .all()
}

const listBackward = (
  database: AgentDatabase,
  limit: number,
  cursorRow?: DeviceRow,
): DeviceRow[] => {
  const rows =
    cursorRow === undefined
      ? database.db
          .select()
          .from(devices)
          .orderBy(asc(devices.pairedAt), desc(devices.id))
          .limit(limit)
          .all()
      : database.db
          .select()
          .from(devices)
          .where(conditionBefore(cursorRow))
          .orderBy(asc(devices.pairedAt), desc(devices.id))
          .limit(limit)
          .all()

  return [...rows].sort((left, right) => compareDevices({ left, right }))
}

const matchesStateFilter = (
  device: Device,
  state: DeviceState | undefined,
): boolean => state === undefined || device.state === state

const listAllRows = (database: AgentDatabase): DeviceRow[] =>
  database.db
    .select()
    .from(devices)
    .orderBy(desc(devices.pairedAt), asc(devices.id))
    .all()

const paginateFiltered = (
  filtered: Device[],
  limit: number,
  decodedCursor: DevicePageCursorPayload | undefined,
): DeviceListResult => {
  const startIndex = (() => {
    if (decodedCursor === undefined) {
      return 0
    }

    const cursorIndex = filtered.findIndex((device) => device.id === decodedCursor.id)
    if (cursorIndex < 0) {
      return -1
    }

    return decodedCursor.edge === "after" ? cursorIndex + 1 : Math.max(0, cursorIndex - limit)
  })()

  if (startIndex < 0) {
    return { ok: false, error: { kind: "invalid_cursor" } }
  }

  const items = filtered.slice(startIndex, startIndex + limit)

  const first = items[0]
  const last = items[items.length - 1]
  const firstIndex = first === undefined ? -1 : filtered.findIndex((d) => d.id === first.id)
  const lastIndex = last === undefined ? -1 : filtered.findIndex((d) => d.id === last.id)

  return {
    ok: true,
    value: {
      items,
      limit,
      nextCursor:
        lastIndex >= 0 && lastIndex < filtered.length - 1
          ? encodeDevicePageCursor({ id: last.id, edge: "after" })
          : undefined,
      previousCursor:
        firstIndex > 0
          ? encodeDevicePageCursor({ id: first.id, edge: "before" })
          : undefined,
      count: filtered.length,
    },
  }
}

export const makeListDevices =
  (database: AgentDatabase): ListDevices =>
  (options: ListDevicesQuery): DeviceListResult => {
    const limit = options.limit
    const decodedCursor =
      options.cursor === undefined ? undefined : decodeDevicePageCursor(options.cursor)

    if (options.cursor !== undefined && decodedCursor?.ok !== true) {
      return { ok: false, error: { kind: "invalid_cursor" } }
    }

    if (options.state !== undefined) {
      const filtered = listAllRows(database)
        .map(rowToDevice)
        .filter((device) => matchesStateFilter(device, options.state))

      return paginateFiltered(
        filtered,
        limit,
        decodedCursor?.ok === true ? decodedCursor.value : undefined,
      )
    }

    const cursorRow =
      decodedCursor?.ok === true
        ? getDeviceRowById(database, decodedCursor.value.id)
        : undefined

    if (decodedCursor?.ok === true && cursorRow === undefined) {
      return { ok: false, error: { kind: "invalid_cursor" } }
    }

    const rows =
      decodedCursor?.ok === true && decodedCursor.value.edge === "before"
        ? listBackward(database, limit, cursorRow)
        : listForward(database, limit, cursorRow)

    const cursors = buildPageCursors(database, rows)
    const countRow = database.db
      .select({ value: sql<number>`count(*)` })
      .from(devices)
      .get()
    if (countRow === undefined) {
      throw new Error("device count query returned no row")
    }

    return {
      ok: true,
      value: {
        items: rows.map(rowToDevice),
        limit,
        nextCursor: cursors.nextCursor,
        previousCursor: cursors.previousCursor,
        count: Number(countRow.value),
      },
    }
  }
