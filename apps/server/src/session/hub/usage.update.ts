import { z } from "zod"

export const UsageUpdateSchema = z
  .object({
    sessionUpdate: z.literal("usage_update"),
    used: z.number().nonnegative(),
    size: z.number().nonnegative(),
  })
  .passthrough()

export type UsageUpdate = z.infer<typeof UsageUpdateSchema>

export const parseUsageUpdate = (update: unknown): UsageUpdate | null => {
  const parsed = UsageUpdateSchema.safeParse(update)
  if (!parsed.success) {
    return null
  }
  return parsed.data
}
