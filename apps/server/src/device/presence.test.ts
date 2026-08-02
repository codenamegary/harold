import { afterEach, describe, expect, test } from "bun:test"
import {
  clearDevicePresence,
  isDeviceOnline,
  registerDevicePresence,
} from "./presence"

afterEach(() => {
  clearDevicePresence()
})

describe("device presence", () => {
  test("online only while at least one connection is registered", () => {
    expect(isDeviceOnline("device_a")).toBe(false)

    const unregisterFirst = registerDevicePresence({
      deviceId: "device_a",
      connection: { id: 1 },
    })
    expect(isDeviceOnline("device_a")).toBe(true)

    const unregisterSecond = registerDevicePresence({
      deviceId: "device_a",
      connection: { id: 2 },
    })
    unregisterFirst()
    expect(isDeviceOnline("device_a")).toBe(true)

    unregisterSecond()
    expect(isDeviceOnline("device_a")).toBe(false)
  })

  test("tracks devices independently", () => {
    const unregisterA = registerDevicePresence({
      deviceId: "device_a",
      connection: {},
    })
    expect(isDeviceOnline("device_a")).toBe(true)
    expect(isDeviceOnline("device_b")).toBe(false)

    unregisterA()
    expect(isDeviceOnline("device_a")).toBe(false)
  })
})
