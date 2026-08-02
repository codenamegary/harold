import { z } from "zod"

export const EventStreamAuthFrameSchema = z.strictObject({
  type: z.literal("auth"),
  authorization: z.string().min(1),
})

export type EventStreamAuthFrame = z.infer<typeof EventStreamAuthFrameSchema>
