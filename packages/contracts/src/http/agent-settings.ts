import { z } from "zod"
import { AgentIdSchema } from "./agent.id.generated"

export { AgentIdSchema }

export const AgentSpawnKindSchema = z.enum(["binary", "npx", "uvx"])

export const AgentSpawnSnapshotSchema = z.strictObject({
  kind: AgentSpawnKindSchema,
  binaryName: z.string().min(1),
  command: z.array(z.string().min(1)).min(1),
  displayName: z.string().min(1),
  authMethodId: z.string().min(1),
})

export const AgentSettingsSchema = z.strictObject({
  id: AgentIdSchema,
  displayName: z.string().min(1),
  available: z.boolean(),
  enabled: z.boolean(),
  path: z.string().min(1).nullable(),
  present: z.boolean(),
  popular: z.boolean(),
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

export const ImportDetectCandidateSchema = z.strictObject({
  id: AgentIdSchema,
  displayName: z.string().min(1),
  present: z.boolean(),
  path: z.string().min(1).nullable(),
  inCatalog: z.boolean(),
  alreadyEnabled: z.boolean(),
  spawn: AgentSpawnSnapshotSchema,
})

export const ImportDetectResponseSchema = z.strictObject({
  items: z.array(ImportDetectCandidateSchema),
})

export const ImportApplyAgentBodySchema = z.strictObject({
  id: AgentIdSchema,
  path: z.string().min(1).nullable(),
  spawn: AgentSpawnSnapshotSchema,
})

export const ImportApplyBodySchema = z.strictObject({
  agents: z.array(ImportApplyAgentBodySchema).min(1),
})

export type AgentId = z.infer<typeof AgentIdSchema>
export type AgentSpawnSnapshot = z.infer<typeof AgentSpawnSnapshotSchema>
export type AgentSettings = z.infer<typeof AgentSettingsSchema>
export type AgentSettingsCollection = z.infer<typeof AgentSettingsCollectionSchema>
export type UpdateAgentSettingsBody = z.infer<typeof UpdateAgentSettingsBodySchema>
export type DetectAgentPathResponse = z.infer<typeof DetectAgentPathResponseSchema>
export type ImportDetectCandidate = z.infer<typeof ImportDetectCandidateSchema>
export type ImportDetectResponse = z.infer<typeof ImportDetectResponseSchema>
export type ImportApplyBody = z.infer<typeof ImportApplyBodySchema>
