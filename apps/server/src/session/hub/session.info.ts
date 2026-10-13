import { z } from "zod"

const SessionInfoUpdateSchema = z
  .object({
    sessionUpdate: z.literal("session_info_update"),
    title: z.string().nullable().optional(),
  })
  .passthrough()

export type SessionInfoUpdate = z.infer<typeof SessionInfoUpdateSchema>

export const parseSessionInfoUpdate = (update: unknown): SessionInfoUpdate | null => {
  const parsed = SessionInfoUpdateSchema.safeParse(update)
  if (!parsed.success) {
    return null
  }
  return parsed.data
}
