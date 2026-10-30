import { z } from "zod"
import { TimestampSchema } from "./primitives"
import { BindHostSchema } from "./runtime-settings"

export const HaroldStateSchema = z.enum(["starting", "online", "shutting_down", "offline"])

export type HaroldState = z.infer<typeof HaroldStateSchema>

export const AcpStateSchema = z.enum(["stopped", "starting", "ready", "error"])

export const StatusSchema = z.strictObject({
  version: z.string().min(1),
  state: HaroldStateSchema,
  bindAddress: BindHostSchema,
  port: z.number().int().positive(),
  startedAt: TimestampSchema,
  acp: z.strictObject({
    state: AcpStateSchema,
    activeSessions: z.number().int().nonnegative(),
  }),
})

export type Status = z.infer<typeof StatusSchema>

/**
 * The wire body of the unauthenticated `GET /v1/status` reachability probe.
 * Deliberately minimal: the daemon serves every interface, so any network
 * neighbor can read this. Runtime detail (bind, uptime, ACP) stays in the
 * daemon state file, which only the host can read.
 */
export const LivenessSchema = z.strictObject({
  state: HaroldStateSchema,
  version: z.string().min(1),
})

export type Liveness = z.infer<typeof LivenessSchema>
