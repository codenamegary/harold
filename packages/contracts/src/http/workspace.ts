import { z } from "zod"
import { createCollectionSchema } from "./collection"
import { IdSchema, TimestampSchema } from "./primitives"

export const WorkspaceStateSchema = z.enum([
  "available",
  "missing",
  "unavailable",
])

export const WorkspaceSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1).max(80),
    path: z.string().min(1),
    state: WorkspaceStateSchema,
    createdAt: TimestampSchema,
    lastUsedAt: TimestampSchema,
  })
  .strict()

export const CreateWorkspaceBodySchema = z
  .object({
    name: z.string().min(1).max(80),
    path: z.string().min(1),
  })
  .strict()

export const UpdateWorkspaceBodySchema = z
  .object({
    name: z.string().min(1).max(80),
  })
  .strict()

export const WorkspaceCollectionSchema = createCollectionSchema(WorkspaceSchema)

export type Workspace = z.infer<typeof WorkspaceSchema>
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>
export type CreateWorkspaceBody = z.infer<typeof CreateWorkspaceBodySchema>
export type UpdateWorkspaceBody = z.infer<typeof UpdateWorkspaceBodySchema>
export type WorkspaceCollection = z.infer<typeof WorkspaceCollectionSchema>
