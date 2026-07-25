import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives";

export const WorkspaceStateSchema = z.enum([
  "available",
  "missing",
  "unavailable",
]);

export const WorkspaceSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1).max(80),
    path: z.string().min(1),
    state: WorkspaceStateSchema,
    createdAt: TimestampSchema,
    lastUsedAt: TimestampSchema,
  })
  .strict();

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
