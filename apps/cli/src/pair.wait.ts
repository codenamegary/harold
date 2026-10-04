import { DeviceError } from "core/device/errors"
import { GetPairingCodeById } from "core/device/ports"

const DEFAULT_POLL_INTERVAL_MS = 1000

export type WaitPairingClaimDeps = Readonly<{
  getPairingCodeById: GetPairingCodeById
  now: () => Date
  sleep: (ms: number) => Promise<void>
  pollIntervalMs?: number
}>

export type WaitPairingClaimResult =
  | { ok: true; value: { pairingCodeId: string } }
  | { ok: false; error: DeviceError }

/**
 * Polls the pairing code row until a device claims it, it expires, or it is
 * revoked. The reader, clock, and sleep are injected so the loop stays
 * testable and stays out of core.
 */
export const waitForPairingClaim =
  (deps: WaitPairingClaimDeps) =>
  async (pairingCodeId: string): Promise<WaitPairingClaimResult> => {
    const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS

    for (;;) {
      const snapshot = deps.getPairingCodeById(pairingCodeId)

      if (snapshot === undefined) {
        return { ok: false, error: { kind: "pairing_code_not_found" } }
      }

      if (snapshot.state === "claimed") {
        return { ok: true, value: { pairingCodeId } }
      }

      if (snapshot.state === "revoked") {
        return { ok: false, error: { kind: "pairing_code_revoked" } }
      }

      if (snapshot.state === "expired" || Date.parse(snapshot.expiresAt) <= deps.now().getTime()) {
        return { ok: false, error: { kind: "pairing_code_expired" } }
      }

      await deps.sleep(pollIntervalMs)
    }
  }
