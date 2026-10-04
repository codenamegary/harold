import { z } from "zod"
import { AcpStateSchema } from "contracts/http/status"

/**
 * Projection of ACP supervisor liveness. Structurally satisfied by the
 * server's `AcpSupervisorStatus`; the supervisor itself stays a server
 * runtime concern and never leaks into core.
 */
export type AcpStatus = {
  readonly state: z.infer<typeof AcpStateSchema>
  readonly activeSessions: number
}
