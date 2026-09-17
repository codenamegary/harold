import { ClaimPairingCodeBody, PairingCodeValueSchema } from "contracts/http/pairing-code"
import { DeviceCredentialResponse } from "contracts/http/device"
import {
  ClaimPairingCodeRow,
  GetPairingCodeById,
  ListActivePairingCodes,
  ListPairingCodesByStates,
  MarkExpiredActiveBefore,
  MarkPairingCodeExpired,
  PairingCodeSnapshot,
} from "./device.ports"
import { DeviceError } from "./device.errors"
import { createDeviceCredential } from "./device.create.credential"
import { normalizePairingCode } from "./device.generate.pairing.code"
import { hashDeviceCredential } from "./device.hash.credential"
import { verifyPairingCode } from "./device.hash.pairing.code"

const DEFAULT_DEVICE_NAME = "Paired device"

export type ClaimPairingCodeCommand = Readonly<{
  code: string
  body: ClaimPairingCodeBody
}>

export type ClaimPairingCodeResult =
  | { ok: true; value: DeviceCredentialResponse }
  | { ok: false; error: DeviceError }

export type ClaimPairingCodeDeps = Readonly<{
  markExpiredActiveBefore: MarkExpiredActiveBefore
  listActivePairingCodes: ListActivePairingCodes
  listPairingCodesByStates: ListPairingCodesByStates
  markPairingCodeExpired: MarkPairingCodeExpired
  getPairingCodeById: GetPairingCodeById
  claimPairingCodeRow: ClaimPairingCodeRow
}>

const nowIso = (): string => new Date().toISOString()

const findMatchingPairingCode = async (
  code: string,
  rows: ReadonlyArray<PairingCodeSnapshot>,
): Promise<PairingCodeSnapshot | undefined> => {
  const matches = await Promise.all(
    rows.map(async (row) => ({
      row,
      matched: await verifyPairingCode({ code, codeHash: row.codeHash }),
    })),
  )

  return matches.find((entry) => entry.matched)?.row
}

const resolveRaceOutcome = (
  latest: PairingCodeSnapshot | undefined,
  now: string,
): DeviceError => {
  if (latest?.state === "claimed") {
    return { kind: "pairing_code_claimed" }
  }
  if (latest?.state === "expired" || (latest !== undefined && latest.expiresAt <= now)) {
    return { kind: "pairing_code_expired" }
  }
  if (latest?.state === "revoked") {
    return { kind: "pairing_code_revoked" }
  }
  return { kind: "pairing_code_not_found" }
}

export const makeClaimPairingCode =
  (deps: ClaimPairingCodeDeps) =>
  async (command: ClaimPairingCodeCommand): Promise<ClaimPairingCodeResult> => {
    const normalized = normalizePairingCode(command.code)
    if (!PairingCodeValueSchema.safeParse(normalized).success) {
      return { ok: false, error: { kind: "pairing_code_not_found" } }
    }

    const now = nowIso()
    deps.markExpiredActiveBefore({ nowIso: now })

    const activeMatch = await findMatchingPairingCode(
      normalized,
      deps.listActivePairingCodes(),
    )

    if (activeMatch !== undefined) {
      if (activeMatch.expiresAt <= now) {
        deps.markPairingCodeExpired({ id: activeMatch.id })
        return { ok: false, error: { kind: "pairing_code_expired" } }
      }

      const credential = createDeviceCredential()
      const credentialHash = hashDeviceCredential(credential)
      const name = command.body.name ?? DEFAULT_DEVICE_NAME
      const platform = command.body.platform ?? null

      const claimed = deps.claimPairingCodeRow({
        pairingCodeId: activeMatch.id,
        name,
        platform,
        credentialHash,
        pairedAt: now,
      })

      if (!claimed.ok) {
        if (claimed.error.kind === "pairing_code_race") {
          const latest = deps.getPairingCodeById(activeMatch.id)
          return { ok: false, error: resolveRaceOutcome(latest, now) }
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

    const unusableMatch = await findMatchingPairingCode(
      normalized,
      deps.listPairingCodesByStates(["claimed", "expired", "revoked"]),
    )

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
