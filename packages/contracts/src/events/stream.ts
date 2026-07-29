import { z } from "zod"
import { IdSchema } from "../http/primitives"
import { EventSchema } from "./event"
import { EventCursorSchema } from "./primitives"

export const EventStreamQuerySchema = z.strictObject({
  cursor: EventCursorSchema.optional(),
  workspaceId: IdSchema.optional(),
  sessionId: IdSchema.optional(),
})

export const EventFrameSchema = z.array(EventSchema).min(1).max(500)

export type EventStreamQuery = z.infer<typeof EventStreamQuerySchema>
export type EventFrame = z.infer<typeof EventFrameSchema>
