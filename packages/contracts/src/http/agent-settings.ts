import { z } from "zod"

export const AgentIdSchema = z.enum(["cursor", "claude"])

export const AgentSettingsSchema = z.strictObject({
  id: AgentIdSchema,
  displayName: z.string().min(1),
  available: z.boolean(),
  enabled: z.boolean(),
  path: z.string().min(1).nullable(),
  pathValid: z.boolean(),
})

export const AgentSettingsCollectionSchema = z.strictObject({
  items: z.array(AgentSettingsSchema),
})

export const UpdateAgentSettingsEnableOnlyBodySchema = z.strictObject({
  enabled: z.boolean(),
})

export const UpdateAgentSettingsWithPathBodySchema = z.strictObject({
  enabled: z.boolean(),
  path: z.string().min(1),
})

export const UpdateAgentSettingsBodySchema = z.union([
  UpdateAgentSettingsEnableOnlyBodySchema,
  UpdateAgentSettingsWithPathBodySchema,
])

export const DetectAgentPathResponseSchema = z.strictObject({
  path: z.string().min(1),
})

export type AgentId = z.infer<typeof AgentIdSchema>
export type AgentSettings = z.infer<typeof AgentSettingsSchema>
export type AgentSettingsCollection = z.infer<typeof AgentSettingsCollectionSchema>
export type UpdateAgentSettingsBody = z.infer<typeof UpdateAgentSettingsBodySchema>
export type DetectAgentPathResponse = z.infer<typeof DetectAgentPathResponseSchema>
