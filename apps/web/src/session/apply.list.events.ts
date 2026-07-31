import { Event } from "contracts/events/event"
import { SessionCollection, SessionState } from "contracts/http/session"

const isArchivedState = (state: SessionState) => state === "archived"

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

  const items = params.collection.items.flatMap((item) => {
    const nextState = stateBySessionId.get(item.id)
    if (nextState === undefined) {
      return [item]
    }

    if (isArchivedState(nextState)) {
      return []
    }

    return [
      {
        ...item,
        state: nextState,
      },
    ]
  })

  return {
    items,
    page: {
      ...params.collection.page,
      count: items.length,
    },
  }
}
