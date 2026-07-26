import { z } from "zod"
import { createCollectionSchema } from "./collection"
import { CursorSchema, IdSchema, TimestampSchema } from "./primitives"

export const WorkspaceStateSchema = z.enum([
  "available",
  "missing",
  "unavailable",
])

export const WorkspaceSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1).max(80),
  path: z.string().min(1),
  state: WorkspaceStateSchema,
  createdAt: TimestampSchema,
  lastUsedAt: TimestampSchema,
})

export const CreateWorkspaceBodySchema = z.strictObject({
  name: z.string().min(1).max(80),
  path: z.string().min(1),
})

export const UpdateWorkspaceBodySchema = z.strictObject({
  name: z.string().min(1).max(80),
})

export const WorkspaceCollectionSchema = createCollectionSchema(WorkspaceSchema)

export const ListWorkspacesQuerySchema = z.strictObject({
  limit: z.coerce.number().int().positive().max(200).default(100),
  cursor: CursorSchema.optional(),
  q: z.string().min(1).optional(),
  state: WorkspaceStateSchema.optional(),
})

export type Workspace = z.infer<typeof WorkspaceSchema>
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>
export type CreateWorkspaceBody = z.infer<typeof CreateWorkspaceBodySchema>
export type UpdateWorkspaceBody = z.infer<typeof UpdateWorkspaceBodySchema>
export type WorkspaceCollection = z.infer<typeof WorkspaceCollectionSchema>
export type ListWorkspacesQuery = z.infer<typeof ListWorkspacesQuerySchema>
