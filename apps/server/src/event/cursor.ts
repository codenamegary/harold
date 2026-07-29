import { EventCursorSchema } from "contracts/events/primitives"

export const eventCursorToString = (cursor: bigint): string =>
  EventCursorSchema.parse(cursor.toString())

export const parseEventCursor = (cursor: string): bigint | undefined => {
  const parsed = EventCursorSchema.safeParse(cursor)
  if (!parsed.success) {
    return undefined
  }

  return BigInt(parsed.data)
}
