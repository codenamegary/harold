import { z } from "zod"

const AcpSessionIdParamsSchema = z.object({
  sessionId: z.string().min(1),
}).passthrough()

export const readAcpSessionId = (params: unknown): string | undefined => {
  const parsed = AcpSessionIdParamsSchema.safeParse(params)
  if (!parsed.success) {
    return undefined
  }
  return parsed.data.sessionId
}
