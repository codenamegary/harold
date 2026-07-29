import { EventCursorSchema } from "contracts/events/primitives"

export const MAX_SAFE_EVENT_CURSOR = BigInt(Number.MAX_SAFE_INTEGER)

export const eventCursorToString = (cursor: bigint): string =>
  EventCursorSchema.parse(cursor.toString())

export const parseEventCursor = (cursor: string): bigint | undefined => {
  const parsed = EventCursorSchema.safeParse(cursor)
  if (!parsed.success) {
    return undefined
  }

  return BigInt(parsed.data)
}

export const isUnsafeEventCursor = (cursor: bigint): boolean => cursor > MAX_SAFE_EVENT_CURSOR
