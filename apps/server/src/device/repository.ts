import { and, eq, gt, inArray, lte } from "drizzle-orm"
import { Device } from "contracts/http/device"
import { PairingCodeState } from "contracts/http/pairing-code"
import { AgentDatabase, DbExecutor } from "../persistence/database"
import { devices } from "../persistence/schema/devices"
import { pairingCodes } from "../persistence/schema/pairing-codes"
import { createDeviceId } from "./create.device.id"
import { createPairingId } from "./create.pairing.id"
import { DeviceError } from "./errors"

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

type DeviceRow = typeof devices.$inferSelect

const rowToDevice = (row: DeviceRow): Device => ({
  id: row.id,
  name: row.name,
  platform: row.platform,
  state: row.revokedAt === null ? "online" : "revoked",
  pairedAt: row.pairedAt,
  lastSeenAt: row.lastSeenAt,
})

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

  return {
    insertPairingCode,
    listActivePairingCodes,
    listPairingCodesByStates,
    markPairingCodeExpired,
    markExpiredActiveBefore,
    claimPairingCode,
    getPairingCodeById,
    getByCredentialHash,
  }
}

export type DeviceRepository = ReturnType<typeof createDeviceRepository>
