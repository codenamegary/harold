import { z } from "zod"
import { StatusSchema } from "contracts/http/status"
import { TimestampSchema } from "contracts/http/primitives"

/**
 * Envelope the daemon atomically persists to `<dataDir>/daemon-state.json`
 * so the CLI can read live state without a host HTTP route. See ADR-0006.
 */
export const DaemonStateSchema = z.strictObject({
  pid: z.number().int().positive(),
  writtenAt: TimestampSchema,
  status: StatusSchema,
})

export type DaemonState = z.infer<typeof DaemonStateSchema>

export type DaemonStateReadError =
  | { readonly kind: "not_found" }
  | { readonly kind: "invalid"; readonly detail: string }

export type ReadDaemonStateResult =
  | { readonly ok: true; readonly state: DaemonState }
  | { readonly ok: false; readonly error: DaemonStateReadError }
