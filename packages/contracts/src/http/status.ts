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
