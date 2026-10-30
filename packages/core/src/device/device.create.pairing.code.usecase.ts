import { CreatePairingCodeResponse } from "contracts/http/pairing-code"
import { DeviceError } from "./device.errors"
import { InsertPairingCode } from "./device.ports"
import { generatePairingCode } from "./device.generate.pairing.code"
import { hashPairingCode } from "./device.hash.pairing.code"

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000

export type CreatePairingCodeDeps = Readonly<{
  insertPairingCode: InsertPairingCode
}>

export type CreatePairingCodeResult =
  | { ok: true; value: CreatePairingCodeResponse }
  | { ok: false; error: DeviceError }

/**
 * Issues a pairing code against the endpoint the caller passes. Choosing the
 * endpoint is a control-plane concern: the CLI pair flow resolves it from
 * history or interface detection and probes it before calling this (#458).
 */
export const makeCreatePairingCode =
  (deps: CreatePairingCodeDeps) =>
  async (endpoint: string): Promise<CreatePairingCodeResult> => {
    const code = generatePairingCode()
    const codeHash = await hashPairingCode(code)
    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.parse(createdAt) + PAIRING_CODE_TTL_MS).toISOString()

    const inserted = deps.insertPairingCode({ codeHash, createdAt, expiresAt })
    if (!inserted.ok) {
      return inserted
    }

    return {
      ok: true,
      value: {
        id: inserted.value.id,
        code,
        endpoint,
        state: "active",
        createdAt: inserted.value.createdAt,
        expiresAt: inserted.value.expiresAt,
      },
    }
  }
