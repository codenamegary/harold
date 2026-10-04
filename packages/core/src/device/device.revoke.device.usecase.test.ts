import { describe, expect, test } from "bun:test"
import { makeRevokeDevice } from "./device.revoke.device.usecase"

describe("revoke device use case", () => {
  test("revokes softly by default and closes the device connections", () => {
    const calls: string[] = []

    const revokeDevice = makeRevokeDevice({
      revokeDeviceRow: (input) => {
        calls.push(`revoke:${input.deviceId}:hardDelete=${String(input.hardDelete)}`)
        return { ok: true, value: { newlyRevoked: true } }
      },
      closeDeviceConnections: (deviceId) => {
        calls.push(`close:${deviceId}`)
      },
    })

    const result = revokeDevice({ deviceId: "dev_1" })

    expect(result).toEqual({ ok: true, value: { newlyRevoked: true } })
    expect(calls).toEqual(["revoke:dev_1:hardDelete=false", "close:dev_1"])
  })

  test("passes the hard delete flag through to the row port", () => {
    let receivedHardDelete: boolean | undefined

    const revokeDevice = makeRevokeDevice({
      revokeDeviceRow: (input) => {
        receivedHardDelete = input.hardDelete
        return { ok: true, value: { newlyRevoked: true } }
      },
      closeDeviceConnections: () => {},
    })

    revokeDevice({ deviceId: "dev_1", hardDelete: true })

    expect(receivedHardDelete).toBe(true)
  })

  test("still closes connections when the device was already revoked", () => {
    const closed: string[] = []

    const revokeDevice = makeRevokeDevice({
      revokeDeviceRow: () => ({ ok: true, value: { newlyRevoked: false } }),
      closeDeviceConnections: (deviceId) => {
        closed.push(deviceId)
      },
    })

    const result = revokeDevice({ deviceId: "dev_1" })

    expect(result).toEqual({ ok: true, value: { newlyRevoked: false } })
    expect(closed).toEqual(["dev_1"])
  })

  test("propagates the failure and skips closing connections", () => {
    const revokeDevice = makeRevokeDevice({
      revokeDeviceRow: () => ({
        ok: false,
        error: { kind: "device_not_found" as const },
      }),
      closeDeviceConnections: () => {
        throw new Error("closeDeviceConnections should not be called")
      },
    })

    const result = revokeDevice({ deviceId: "dev_missing" })

    expect(result).toEqual({
      ok: false,
      error: { kind: "device_not_found" },
    })
  })
})
