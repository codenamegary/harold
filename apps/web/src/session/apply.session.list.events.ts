import { Event } from "contracts/events/event"
import { SessionCollection, SessionCollectionSchema, SessionState } from "contracts/http/session"

export const applySessionListEvents = (params: {
  collection: SessionCollection
  events: ReadonlyArray<Event>
}): SessionCollection => {
  const stateBySessionId = params.events.reduce<ReadonlyMap<string, SessionState>>(
    (acc, event) => {
      if (event.type !== "session.state") {
        return acc
      }

      const next = new Map(acc)
      next.set(event.payload.sessionId, event.payload.state)
      return next
    },
    new Map(),
  )

  if (stateBySessionId.size === 0) {
    return params.collection
  }

  const hasMatch = params.collection.items.some((item) => stateBySessionId.has(item.id))
  if (!hasMatch) {
    return params.collection
  }

  return SessionCollectionSchema.parse({
    items: params.collection.items.map((item) => {
      const nextState = stateBySessionId.get(item.id)
      if (nextState === undefined) {
        return item
      }

      return {
        ...item,
        state: nextState,
      }
    }),
    page: params.collection.page,
  })
}
