import { z } from "zod"

export const AgentIdSchema = z.enum(["cursor", "claude"])

export const AgentResolutionStatusSchema = z.enum([
  "detected",
  "overridden",
  "not_found",
  "unavailable",
])

export const AgentSettingsSchema = z.strictObject({
  id: AgentIdSchema,
  displayName: z.string().min(1),
  available: z.boolean(),
  enabled: z.boolean(),
  detectedPath: z.string().min(1).nullable(),
  pathOverride: z.string().min(1).nullable(),
  effectivePath: z.string().min(1).nullable(),
  resolutionStatus: AgentResolutionStatusSchema,
})

export const AgentSettingsCollectionSchema = z.strictObject({
  items: z.array(AgentSettingsSchema),
})

export const UpdateAgentSettingsBodySchema = z.strictObject({
  enabled: z.boolean().optional(),
  pathOverride: z.string().min(1).nullable().optional(),
})

export type AgentId = z.infer<typeof AgentIdSchema>
export type AgentResolutionStatus = z.infer<typeof AgentResolutionStatusSchema>
export type AgentSettings = z.infer<typeof AgentSettingsSchema>
export type AgentSettingsCollection = z.infer<typeof AgentSettingsCollectionSchema>
export type UpdateAgentSettingsBody = z.infer<typeof UpdateAgentSettingsBodySchema>
