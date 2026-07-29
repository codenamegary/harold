import { z } from "zod"

export const lifecycleKinds = [
  "server.status",
  "workspace.changed",
  "session.created",
  "session.state",
] as const

export const LifecycleKindSchema = z.enum(lifecycleKinds)

export type LifecycleKind = z.infer<typeof LifecycleKindSchema>
