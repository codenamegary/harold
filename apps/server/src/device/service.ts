import {
  ClaimPairingCodeBody,
  CreatePairingCodeResponse,
  PairingCodeValueSchema,
} from "contracts/http/pairing-code"
import { DeviceCredentialResponse } from "contracts/http/device"
import { Config } from "../config/config"
import { AgentDatabase } from "../persistence/database"
import { createDeviceCredential } from "./create.device.credential"
import { DeviceError } from "./errors"
import { generatePairingCode, normalizePairingCode } from "./generate.pairing.code"
import { hashDeviceCredential } from "./hash.device.credential"
import { hashPairingCode, verifyPairingCode } from "./hash.pairing.code"
import { DeviceRepository, PairingCodeRow } from "./repository"

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000
const DEFAULT_DEVICE_NAME = "Paired device"

type PairingClaimAbort = {
  readonly tag: "pairing_claim_abort"
  readonly error: DeviceError
}

const pairingClaimAbort = (error: DeviceError): PairingClaimAbort => ({
  tag: "pairing_claim_abort",
  error,
})

const isPairingClaimAbort = (error: unknown): error is PairingClaimAbort =>
  typeof error === "object" &&
  error !== null &&
  "tag" in error &&
  (error as PairingClaimAbort).tag === "pairing_claim_abort"

export type DeviceServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DeviceError }

type DeviceServiceContext = {
  database: AgentDatabase
  deviceRepository: DeviceRepository
  config: Config
}

const nowIso = (): string => new Date().toISOString()

const loopbackEndpoint = (config: Config): string =>
  `http://${config.host}:${config.port}`

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
  const createPairingCode = async (): Promise<
    DeviceServiceResult<CreatePairingCodeResponse>
  > => {
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
        endpoint: loopbackEndpoint(context.config),
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

      try {
        const device = context.database.db.transaction((tx) => {
          const result = context.deviceRepository.claimPairingCode({
            pairingCodeId: activeMatch.id,
            name,
            platform,
            credentialHash,
            pairedAt: now,
            executor: tx,
          })
          if (!result.ok) {
            throw pairingClaimAbort(result.error)
          }
          return result.value
        })

        return {
          ok: true,
          value: {
            device,
            credential,
          },
        }
      } catch (error: unknown) {
        if (!isPairingClaimAbort(error)) {
          throw error
        }

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

  return {
    createPairingCode,
    claimPairingCode,
  }
}

export type DeviceService = ReturnType<typeof createDeviceService>
