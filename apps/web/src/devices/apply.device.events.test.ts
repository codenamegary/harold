import { describe, expect, test } from "bun:test"
import { Event } from "contracts/events/event"
import { DeviceCollectionSchema } from "contracts/http/device"
import { applyDeviceEvents } from "./apply.device.events"

const collection = DeviceCollectionSchema.parse({
  items: [
    {
      id: "dev_desktop",
      name: "Studio Desktop",
      platform: "macOS",
      state: "offline",
      pairedAt: "2026-08-02T18:00:00.000Z",
      lastSeenAt: "2026-08-02T20:00:00.000Z",
    },
    {
      id: "dev_tablet",
      name: "Kitchen tablet",
      platform: null,
      state: "online",
      pairedAt: "2026-08-01T18:00:00.000Z",
      lastSeenAt: "2026-08-02T20:55:00.000Z",
    },
  ],
  page: { limit: 100, count: 2 },
})

const deviceEvent = (params: {
  type: "device.connected" | "device.disconnected" | "device.revoked"
  deviceId: string
  cursor: string
}): Event => ({
  type: params.type,
  cursor: params.cursor,
  occurredAt: "2026-08-02T21:00:00.000Z",
  payload: {
    deviceId: params.deviceId,
  },
})

describe("applyDeviceEvents", () => {
  test("updates matching device connection state", () => {
    const next = applyDeviceEvents({
      collection,
      events: [
        deviceEvent({
          type: "device.connected",
          deviceId: "dev_desktop",
          cursor: "20",
        }),
      ],
    })

    expect(next.items[0]?.state).toBe("online")
    expect(next.items[0]?.lastSeenAt).toBe("2026-08-02T21:00:00.000Z")
    expect(next.items[1]?.state).toBe("online")
  })

  test("marks disconnected and revoked devices without removing rows", () => {
    const next = applyDeviceEvents({
      collection,
      events: [
        deviceEvent({
          type: "device.disconnected",
          deviceId: "dev_tablet",
          cursor: "21",
        }),
        deviceEvent({
          type: "device.revoked",
          deviceId: "dev_desktop",
          cursor: "22",
        }),
      ],
    })

    expect(next.items[0]?.state).toBe("revoked")
    expect(next.items[1]?.state).toBe("offline")
  })

  test("ignores device events for devices outside the cached collection", () => {
    const next = applyDeviceEvents({
      collection,
      events: [
        deviceEvent({
          type: "device.connected",
          deviceId: "dev_missing",
          cursor: "23",
        }),
      ],
    })

    expect(next).toBe(collection)
  })
})
