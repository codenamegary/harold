import { describe, expect, test } from "bun:test"
import { makeRemoveDevice } from "./device.remove.device.usecase"

describe("remove device use case", () => {
  test("removes the device row and closes the device connections", () => {
    const calls: string[] = []

    const removeDevice = makeRemoveDevice({
      removeDeviceRow: (input) => {
        calls.push(`remove:${input.deviceId}`)
        return { ok: true }
      },
      closeDeviceConnections: (deviceId) => {
        calls.push(`close:${deviceId}`)
      },
    })

    const result = removeDevice({ deviceId: "dev_1" })

    expect(result).toEqual({ ok: true })
    expect(calls).toEqual(["remove:dev_1", "close:dev_1"])
  })

  test("propagates the failure and skips closing connections", () => {
    const removeDevice = makeRemoveDevice({
      removeDeviceRow: () => ({
        ok: false,
        error: { kind: "device_not_found" as const },
      }),
      closeDeviceConnections: () => {
        throw new Error("closeDeviceConnections should not be called")
      },
    })

    const result = removeDevice({ deviceId: "dev_missing" })

    expect(result).toEqual({
      ok: false,
      error: { kind: "device_not_found" },
    })
  })
})
