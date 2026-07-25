import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives";

export const SessionStateSchema = z.enum([
  "starting",
  "idle",
  "running",
  "awaiting-permission",
  "stopping",
  "offline",
  "error",
  "archived",
]);

export const SessionSchema = z
  .object({
    id: IdSchema,
    workspaceId: IdSchema,
    name: z.string().min(1).max(120),
    state: SessionStateSchema,
    createdAt: TimestampSchema,
    lastUsedAt: TimestampSchema,
    archivedAt: TimestampSchema.nullable(),
  })
  .strict();

export type Session = z.infer<typeof SessionSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
