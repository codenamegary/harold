import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"
import { Device, DeviceState, ListDevicesQuery } from "contracts/http/device"
import { PairingCodeState } from "contracts/http/pairing-code"
import { AgentDatabase, DbExecutor } from "../persistence/database"
import { devices } from "../persistence/schema/devices"
import { pairingCodes } from "../persistence/schema/pairing-codes"
import { createDeviceId } from "./create.device.id"
import { createPairingId } from "./create.pairing.id"
import { DeviceError } from "./errors"
import {
  decodeDevicePageCursor,
  DevicePageCursorPayload,
  encodeDevicePageCursor,
} from "./page.cursor"
import { isDeviceOnline } from "./presence"

export type DeviceRepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DeviceError }

export type PairingCodeRow = typeof pairingCodes.$inferSelect

export type InsertPairingCodeInput = {
  codeHash: string
  createdAt: string
  expiresAt: string
  executor?: DbExecutor
}

export type InsertedPairingCode = {
  id: string
  createdAt: string
  expiresAt: string
  state: "active"
}

export type ClaimDeviceInput = {
  pairingCodeId: string
  name: string
  platform: string | null
  credentialHash: string
  pairedAt: string
  executor?: DbExecutor
}

export type TouchLastSeenInput = {
  deviceId: string
  lastSeenAt: string
  executor?: DbExecutor
}

export type DeviceListPage = {
  items: Device[]
  limit: number
  nextCursor?: string
  previousCursor?: string
  count: number
}

export type DeviceListResult =
  | { ok: true; value: DeviceListPage }
  | { ok: false; error: { kind: "invalid_cursor" } }

type DeviceRow = typeof devices.$inferSelect

const DEFAULT_LIST_LIMIT = 100

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

const compareDevices = (params: { left: DeviceRow; right: DeviceRow }): number => {
  const { left, right } = params
  if (left.pairedAt !== right.pairedAt) {
    return left.pairedAt < right.pairedAt ? 1 : -1
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export const createDeviceRepository = (database: AgentDatabase) => {
  const executorOf = (executor?: DbExecutor): DbExecutor => executor ?? database.db

  const insertPairingCode = (
    input: InsertPairingCodeInput,
  ): DeviceRepositoryResult<InsertedPairingCode> => {
    const id = createPairingId()
    const executor = executorOf(input.executor)

    executor.insert(pairingCodes).values({
      id,
      codeHash: input.codeHash,
      state: "active",
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      claimedAt: null,
      deviceId: null,
    }).run()

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

  // Hash-only storage: claim loads candidate rows and verifies Argon2id until a match.
  const listPairingCodesByStates = (params: {
    states: ReadonlyArray<PairingCodeState>
  }): PairingCodeRow[] => {
    if (params.states.length === 0) {
      return []
    }

    return database.db
      .select()
      .from(pairingCodes)
      .where(inArray(pairingCodes.state, [...params.states]))
      .all()
  }

  const listActivePairingCodes = (): PairingCodeRow[] =>
    database.db
      .select()
      .from(pairingCodes)
      .where(eq(pairingCodes.state, "active"))
      .all()

  const markPairingCodeExpired = (params: {
    id: string
    executor?: DbExecutor
  }): void => {
    const executor = executorOf(params.executor)
    executor
      .update(pairingCodes)
      .set({ state: "expired" })
      .where(and(eq(pairingCodes.id, params.id), eq(pairingCodes.state, "active")))
      .run()
  }

  const markExpiredActiveBefore = (params: {
    nowIso: string
    executor?: DbExecutor
  }): void => {
    const executor = executorOf(params.executor)
    executor
      .update(pairingCodes)
      .set({ state: "expired" })
      .where(
        and(eq(pairingCodes.state, "active"), lte(pairingCodes.expiresAt, params.nowIso)),
      )
      .run()
  }

  const claimPairingCode = (
    input: ClaimDeviceInput,
  ): DeviceRepositoryResult<Device> => {
    const executor = executorOf(input.executor)
    const deviceId = createDeviceId()

    const current = executor
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

    executor
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

    const claimed = executor
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

    const row = executor
      .select()
      .from(devices)
      .where(eq(devices.id, deviceId))
      .get()

    if (row === undefined) {
      return { ok: false, error: { kind: "pairing_code_race" } }
    }

    return { ok: true, value: rowToDevice(row) }
  }

  const getPairingCodeById = (params: { id: string }): PairingCodeRow | undefined =>
    database.db.select().from(pairingCodes).where(eq(pairingCodes.id, params.id)).get()

  const getByCredentialHash = (params: {
    credentialHash: string
  }): DeviceRow | undefined =>
    database.db
      .select()
      .from(devices)
      .where(eq(devices.credentialHash, params.credentialHash))
      .get()

  const getRowById = (id: string): DeviceRow | undefined =>
    database.db.select().from(devices).where(eq(devices.id, id)).get()

  const touchLastSeen = (input: TouchLastSeenInput): void => {
    const executor = executorOf(input.executor)
    executor
      .update(devices)
      .set({ lastSeenAt: input.lastSeenAt })
      .where(and(eq(devices.id, input.deviceId), isNull(devices.revokedAt)))
      .run()
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

  const hasMoreAfter = (row: DeviceRow): boolean =>
    database.db
      .select()
      .from(devices)
      .where(conditionAfter(row))
      .orderBy(desc(devices.pairedAt), asc(devices.id))
      .limit(1)
      .get() !== undefined

  const hasMoreBefore = (row: DeviceRow): boolean =>
    database.db
      .select()
      .from(devices)
      .where(conditionBefore(row))
      .orderBy(asc(devices.pairedAt), desc(devices.id))
      .limit(1)
      .get() !== undefined

  const buildPageCursors = (rows: DeviceRow[]) => {
    if (rows.length === 0) {
      return { nextCursor: undefined, previousCursor: undefined }
    }

    const first = rows[0]
    const last = rows[rows.length - 1]

    return {
      nextCursor: hasMoreAfter(last)
        ? encodeDevicePageCursor({ id: last.id, edge: "after" })
        : undefined,
      previousCursor: hasMoreBefore(first)
        ? encodeDevicePageCursor({ id: first.id, edge: "before" })
        : undefined,
    }
  }

  const listForward = (limit: number, cursorRow?: DeviceRow): DeviceRow[] => {
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

  const listBackward = (limit: number, cursorRow?: DeviceRow): DeviceRow[] => {
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

  const matchesStateFilter = (device: Device, state: DeviceState | undefined): boolean =>
    state === undefined || device.state === state

  const listAllRows = (): DeviceRow[] =>
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

    const items =
      decodedCursor?.edge === "before"
        ? filtered.slice(Math.max(0, startIndex), startIndex + limit)
        : filtered.slice(startIndex, startIndex + limit)

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

  const list = (options: ListDevicesQuery = { limit: DEFAULT_LIST_LIMIT }): DeviceListResult => {
    const limit = options.limit
    const decodedCursor =
      options.cursor === undefined ? undefined : decodeDevicePageCursor(options.cursor)

    if (options.cursor !== undefined && decodedCursor?.ok !== true) {
      return { ok: false, error: { kind: "invalid_cursor" } }
    }

    if (options.state !== undefined) {
      const filtered = listAllRows()
        .map(rowToDevice)
        .filter((device) => matchesStateFilter(device, options.state))

      return paginateFiltered(
        filtered,
        limit,
        decodedCursor?.ok === true ? decodedCursor.value : undefined,
      )
    }

    const cursorRow =
      decodedCursor?.ok === true ? getRowById(decodedCursor.value.id) : undefined

    if (decodedCursor?.ok === true && cursorRow === undefined) {
      return { ok: false, error: { kind: "invalid_cursor" } }
    }

    const rows =
      decodedCursor?.ok === true && decodedCursor.value.edge === "before"
        ? listBackward(limit, cursorRow)
        : listForward(limit, cursorRow)

    const cursors = buildPageCursors(rows)
    const countRow = database.db.select({ value: sql<number>`count(*)` }).from(devices).get()
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

  return {
    insertPairingCode,
    listActivePairingCodes,
    listPairingCodesByStates,
    markPairingCodeExpired,
    markExpiredActiveBefore,
    claimPairingCode,
    getPairingCodeById,
    getByCredentialHash,
    touchLastSeen,
    list,
  }
}

export type DeviceRepository = ReturnType<typeof createDeviceRepository>
