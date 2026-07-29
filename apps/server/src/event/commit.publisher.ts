import { Event } from "contracts/events/event"

export type EventCommitListener = (events: Event[]) => void

export type EventCommitPublisher = {
  subscribe: (listener: EventCommitListener) => () => void
  publish: (events: Event[]) => void
}

export const createEventCommitPublisher = (): EventCommitPublisher => {
  const listeners = new Set<EventCommitListener>()

  const subscribe = (listener: EventCommitListener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const publish = (events: Event[]) => {
    if (events.length === 0) {
      return
    }

    listeners.forEach((listener) => {
      listener(events)
    })
  }

  return { subscribe, publish }
}
