import { Event } from "contracts/events/event"
import { DeviceCollection, DeviceState } from "contracts/http/device"

type DeviceStateUpdate = {
  deviceId: string
  state: DeviceState
  occurredAt: string
}

const deviceStateUpdate = (event: Event): DeviceStateUpdate | undefined => {
  switch (event.type) {
    case "device.connected":
      return {
        deviceId: event.payload.deviceId,
        state: "online",
        occurredAt: event.occurredAt,
      }
    case "device.disconnected":
      return {
        deviceId: event.payload.deviceId,
        state: "offline",
        occurredAt: event.occurredAt,
      }
    case "device.revoked":
      return {
        deviceId: event.payload.deviceId,
        state: "revoked",
        occurredAt: event.occurredAt,
      }
    default:
      return undefined
  }
}

export const applyDeviceEvents = (params: {
  collection: DeviceCollection
  events: ReadonlyArray<Event>
}): DeviceCollection => {
  const updateByDeviceId = params.events.reduce<
    ReadonlyMap<string, { state: DeviceState; occurredAt: string }>
  >((acc, event) => {
    const update = deviceStateUpdate(event)
    if (update === undefined) {
      return acc
    }

    const next = new Map(acc)
    next.set(update.deviceId, {
      state: update.state,
      occurredAt: update.occurredAt,
    })
    return next
  }, new Map())

  if (updateByDeviceId.size === 0) {
    return params.collection
  }

  const hasMatch = params.collection.items.some((item) => updateByDeviceId.has(item.id))
  if (!hasMatch) {
    return params.collection
  }

  const items = params.collection.items.map((item) => {
    const update = updateByDeviceId.get(item.id)
    if (update === undefined) {
      return item
    }

    return {
      ...item,
      state: update.state,
      lastSeenAt: update.state === "online" ? update.occurredAt : item.lastSeenAt,
    }
  })

  return {
    ...params.collection,
    items,
  }
}

export const hasDeviceEvents = (events: ReadonlyArray<Event>) =>
  events.some((event) => event.type.startsWith("device."))

export const hasDevicePairedEvents = (events: ReadonlyArray<Event>) =>
  events.some((event) => event.type === "device.paired")
