import {
  ClaimPairingCodeBody,
  CreatePairingCodeBody,
  CreatePairingCodeResponse,
  PairingCodeValueSchema,
} from "contracts/http/pairing-code"
import { DeviceCollection, DeviceCredentialResponse, ListDevicesQuery } from "contracts/http/device"
import { Config } from "../config/config"
import { RuntimeSettingsRepository } from "../runtime-settings/repository"
import { AgentDatabase } from "../persistence/database"
import { createDeviceCredential } from "./create.device.credential"
import { DeviceError } from "./errors"
import { generatePairingCode, normalizePairingCode } from "./generate.pairing.code"
import { hashDeviceCredential } from "./hash.device.credential"
import { hashPairingCode, verifyPairingCode } from "./hash.pairing.code"
import { closeDeviceConnections } from "./presence"
import { DeviceListResult, DeviceRepository, PairingCodeRow } from "./repository"

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000
const DEFAULT_DEVICE_NAME = "Paired device"
const PROBE_DEVICE_NAME = "Connection test probe"

export type DeviceServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DeviceError | { kind: "invalid_cursor" } }

type DeviceServiceContext = {
  database: AgentDatabase
  deviceRepository: DeviceRepository
  config: Config
  runtimeSettingsRepository: RuntimeSettingsRepository
}

const nowIso = (): string => new Date().toISOString()

const loopbackEndpoint = (config: Config): string =>
  `http://${config.host}:${config.port}`

const advertisedPairingAvailable = (
  advertisedUrl: string | null,
  advertisedUrlEnabled: boolean,
): advertisedUrl is string => advertisedUrl !== null && advertisedUrlEnabled

const resolvePairingEndpoint = (
  context: DeviceServiceContext,
  choice: CreatePairingCodeBody["endpoint"],
): DeviceServiceResult<string> => {
  const settings = context.runtimeSettingsRepository.get()
  const loopback = loopbackEndpoint(context.config)

  if (choice === "loopback") {
    return { ok: true, value: loopback }
  }

  if (choice === "advertised") {
    if (!advertisedPairingAvailable(settings.advertisedUrl, settings.advertisedUrlEnabled)) {
      return { ok: false, error: { kind: "advertised_endpoint_unavailable" } }
    }

    return { ok: true, value: settings.advertisedUrl }
  }

  if (advertisedPairingAvailable(settings.advertisedUrl, settings.advertisedUrlEnabled)) {
    return { ok: true, value: settings.advertisedUrl }
  }

  return { ok: true, value: loopback }
}

const findMatchingPairingCode = async (params: {
  code: string
  rows: ReadonlyArray<PairingCodeRow>
}): Promise<PairingCodeRow | undefined> => {
  const matches = await Promise.all(
    params.rows.map(async (row) => ({
      row,
      matched: await verifyPairingCode({ code: params.code, codeHash: row.codeHash }),
    })),
  )

  return matches.find((entry) => entry.matched)?.row
}

export const createDeviceService = (context: DeviceServiceContext) => {
  const createPairingCode = async (
    body: CreatePairingCodeBody = {},
  ): Promise<DeviceServiceResult<CreatePairingCodeResponse>> => {
    const endpoint = resolvePairingEndpoint(context, body.endpoint)
    if (!endpoint.ok) {
      return endpoint
    }

    const code = generatePairingCode()
    const codeHash = await hashPairingCode(code)
    const createdAt = nowIso()
    const expiresAt = new Date(Date.parse(createdAt) + PAIRING_CODE_TTL_MS).toISOString()

    const inserted = context.deviceRepository.insertPairingCode({
      codeHash,
      createdAt,
      expiresAt,
    })

    if (!inserted.ok) {
      return inserted
    }

    return {
      ok: true,
      value: {
        id: inserted.value.id,
        code,
        endpoint: endpoint.value,
        state: "active",
        createdAt: inserted.value.createdAt,
        expiresAt: inserted.value.expiresAt,
      },
    }
  }

  const claimPairingCode = async (params: {
    code: string
    body: ClaimPairingCodeBody
  }): Promise<DeviceServiceResult<DeviceCredentialResponse>> => {
    const normalized = normalizePairingCode(params.code)
    const parsedCode = PairingCodeValueSchema.safeParse(normalized)
    if (!parsedCode.success) {
      return { ok: false, error: { kind: "pairing_code_not_found" } }
    }

    const now = nowIso()
    context.deviceRepository.markExpiredActiveBefore({ nowIso: now })

    const activeRows = context.deviceRepository.listActivePairingCodes()
    const activeMatch = await findMatchingPairingCode({
      code: normalized,
      rows: activeRows,
    })

    if (activeMatch !== undefined) {
      if (activeMatch.expiresAt <= now) {
        context.deviceRepository.markPairingCodeExpired({ id: activeMatch.id })
        return { ok: false, error: { kind: "pairing_code_expired" } }
      }

      const credential = createDeviceCredential()
      const credentialHash = hashDeviceCredential(credential)
      const name = params.body.name ?? DEFAULT_DEVICE_NAME
      const platform = params.body.platform ?? null

      const claimed = context.database.db.transaction((tx) =>
        context.deviceRepository.claimPairingCode({
          pairingCodeId: activeMatch.id,
          name,
          platform,
          credentialHash,
          pairedAt: now,
          executor: tx,
        }),
      )

      if (!claimed.ok) {
        if (claimed.error.kind === "pairing_code_race") {
          const latest = context.deviceRepository.getPairingCodeById({
            id: activeMatch.id,
          })
          if (latest?.state === "claimed") {
            return { ok: false, error: { kind: "pairing_code_claimed" } }
          }
          if (
            latest?.state === "expired" ||
            (latest !== undefined && latest.expiresAt <= now)
          ) {
            return { ok: false, error: { kind: "pairing_code_expired" } }
          }
          if (latest?.state === "revoked") {
            return { ok: false, error: { kind: "pairing_code_revoked" } }
          }
          return { ok: false, error: { kind: "pairing_code_not_found" } }
        }

        return claimed
      }

      return {
        ok: true,
        value: {
          device: claimed.value,
          credential,
        },
      }
    }

    const unusableRows = context.deviceRepository.listPairingCodesByStates({
      states: ["claimed", "expired", "revoked"],
    })
    const unusableMatch = await findMatchingPairingCode({
      code: normalized,
      rows: unusableRows,
    })

    if (unusableMatch === undefined) {
      return { ok: false, error: { kind: "pairing_code_not_found" } }
    }

    if (unusableMatch.state === "claimed") {
      return { ok: false, error: { kind: "pairing_code_claimed" } }
    }
    if (unusableMatch.state === "revoked") {
      return { ok: false, error: { kind: "pairing_code_revoked" } }
    }
    return { ok: false, error: { kind: "pairing_code_expired" } }
  }

  const listDevices = (query: ListDevicesQuery): DeviceListResult =>
    context.deviceRepository.list(query)

  const toCollection = (page: DeviceListResult): DeviceServiceResult<DeviceCollection> => {
    if (!page.ok) {
      return page
    }

    return {
      ok: true,
      value: {
        items: page.value.items,
        page: {
          limit: page.value.limit,
          nextCursor: page.value.nextCursor,
          previousCursor: page.value.previousCursor,
          count: page.value.count,
        },
      },
    }
  }

  const list = (query: ListDevicesQuery): DeviceServiceResult<DeviceCollection> =>
    toCollection(listDevices(query))

  const revoke = (params: {
    deviceId: string
    hardDelete?: boolean
  }): DeviceServiceResult<{ newlyRevoked: boolean }> => {
    const now = nowIso()
    const hardDelete = params.hardDelete === true

    const result = context.database.db.transaction((tx) => {
      const revoked = context.deviceRepository.revoke({
        deviceId: params.deviceId,
        revokedAt: now,
        executor: tx,
      })

      if (!revoked.ok) {
        return revoked
      }

      if (hardDelete) {
        context.deviceRepository.clearPairingCodeDeviceRefs({
          deviceId: params.deviceId,
          executor: tx,
        })
        const deleted = context.deviceRepository.deleteById({
          deviceId: params.deviceId,
          executor: tx,
        })
        if (!deleted.ok) {
          return deleted
        }
      }

      return {
        ok: true as const,
        value: { newlyRevoked: revoked.value.newlyRevoked },
      }
    })

    if (!result.ok) {
      return result
    }

    closeDeviceConnections(params.deviceId)
    return result
  }

  const createProbeDevice = (): DeviceServiceResult<DeviceCredentialResponse> => {
    const now = nowIso()
    const credential = createDeviceCredential()
    const credentialHash = hashDeviceCredential(credential)

    const inserted = context.database.db.transaction((tx) =>
      context.deviceRepository.insertProbeDevice({
        name: PROBE_DEVICE_NAME,
        platform: null,
        credentialHash,
        pairedAt: now,
        executor: tx,
      }),
    )

    if (!inserted.ok) {
      return inserted
    }

    return {
      ok: true,
      value: {
        device: inserted.value,
        credential,
      },
    }
  }

  return {
    createPairingCode,
    claimPairingCode,
    createProbeDevice,
    list,
    revoke,
  }
}

export type DeviceService = ReturnType<typeof createDeviceService>
