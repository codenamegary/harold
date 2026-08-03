import { z } from "zod"
import { HttpsAbsoluteUrlSchema } from "./runtime-settings"
import { TimestampSchema } from "./primitives"

export const CONNECTION_TEST_PATH = "/v1/connection-test" as const

export const connectionCheckIds = ["dns", "tls", "device-auth"] as const

export const ConnectionCheckIdSchema = z.enum(connectionCheckIds)

export type ConnectionCheckId = z.infer<typeof ConnectionCheckIdSchema>

export const connectionCheckStatuses = ["pass", "fail", "warn"] as const

export const ConnectionCheckStatusSchema = z.enum(connectionCheckStatuses)

export type ConnectionCheckStatus = z.infer<typeof ConnectionCheckStatusSchema>

export const ConnectionCheckResultSchema = z.strictObject({
  id: ConnectionCheckIdSchema,
  status: ConnectionCheckStatusSchema,
  message: z.string().min(1),
})

export type ConnectionCheckResult = z.infer<typeof ConnectionCheckResultSchema>

export const ConnectionTestResponseSchema = z.strictObject({
  advertisedUrl: HttpsAbsoluteUrlSchema,
  checkedAt: TimestampSchema,
  checks: z.array(ConnectionCheckResultSchema).length(3),
  canContinue: z.boolean(),
  canContinueAnyway: z.boolean(),
})

export type ConnectionTestResponse = z.infer<typeof ConnectionTestResponseSchema>
