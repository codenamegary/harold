import { z } from "zod"
import { createCollectionSchema } from "./collection"
import { TimestampSchema } from "./primitives"
import { LogLevelSchema } from "./runtime-settings"

export const LOGS_PATH = "/v1/logs" as const

export const logSources = ["server", "agent"] as const

export const LogSourceSchema = z.enum(logSources)

export type LogSource = z.infer<typeof LogSourceSchema>

export const LogRecordSchema = z.strictObject({
  id: z.string().min(1),
  ts: TimestampSchema,
  level: LogLevelSchema,
  source: LogSourceSchema,
  message: z.string(),
  agentId: z.string().min(1).optional(),
})

export const LogCollectionSchema = createCollectionSchema(LogRecordSchema)

export const ListLogsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().positive().max(500).default(200),
  level: LogLevelSchema.optional(),
  source: LogSourceSchema.optional(),
  agentId: z.string().min(1).optional(),
})

export type LogRecord = z.infer<typeof LogRecordSchema>
export type LogCollection = z.infer<typeof LogCollectionSchema>
export type ListLogsQuery = z.infer<typeof ListLogsQuerySchema>
