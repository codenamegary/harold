import { describe, expect, test } from "bun:test"
import { Device } from "contracts/http/device"
import { renderDeviceList, renderDeviceRevokeError, renderDeviceRevoked } from "./device.render"

const colors = {
  green: (text: string) => text,
  yellow: (text: string) => text,
  red: (text: string) => text,
  dim: (text: string) => `_${text}_`,
}

const aDevice = (overrides: Partial<Device> = {}): Device => ({
  id: "device_01J00000000000000000000000",
  name: "iPhone",
  platform: "ios",
  state: "offline",
  pairedAt: "2026-10-04T17:10:00.000Z",
  lastSeenAt: "2026-10-04T17:12:00.000Z",
  ...overrides,
})

describe("renderDeviceList", () => {
  test("reports the empty state", () => {
    expect(renderDeviceList({ devices: [], colors })).toBe("No devices paired yet.")
  })

  test("prints a table of paired devices with a short id", () => {
    const output = renderDeviceList({
      devices: [
        aDevice({ id: "device_01JABCDEFGHIJKLMNOPQRSTUV", name: "iPhone" }),
        aDevice({ id: "device_01JZYXWVUTSRQPONMLKJIHGF", name: "Pixel", state: "revoked" }),
      ],
      colors,
    })

    expect(output).toContain("ID")
    expect(output).toContain("NAME")
    expect(output).toContain("PLATFORM")
    expect(output).toContain("STATE")
    expect(output).toContain("PAIRED AT")
    expect(output).toContain("device_01JABCDE")
    expect(output).toContain("iPhone")
    expect(output).toContain("ios")
    expect(output).toContain("offline")
    expect(output).toContain("Pixel")
    expect(output).toContain("revoked")
    expect(output).toContain("2026-10-04T17:10:00.000Z")
    expect(output).toContain("2 devices")
  })

  test("colors the state column by state", () => {
    const calls: string[] = []
    const recordingColors = {
      green: (text: string) => {
        calls.push(`green:${text}`)
        return text
      },
      yellow: (text: string) => {
        calls.push(`yellow:${text}`)
        return text
      },
      red: (text: string) => {
        calls.push(`red:${text}`)
        return text
      },
      dim: (text: string) => text,
    }

    renderDeviceList({
      devices: [aDevice({ state: "offline" }), aDevice({ state: "revoked" })],
      colors: recordingColors,
    })

    expect(calls).toContain("yellow:offline")
    expect(calls).toContain("red:revoked")
    expect(calls).not.toContain("green:offline")
  })

  test("pads the plain state before coloring so ANSI escapes keep columns aligned", () => {
    const markerColors = {
      green: (text: string) => `<g>${text}</g>`,
      yellow: (text: string) => `<y>${text}</y>`,
      red: (text: string) => `<r>${text}</r>`,
      dim: (text: string) => text,
    }

    const output = renderDeviceList({
      devices: [aDevice({ state: "online" }), aDevice({ state: "offline" })],
      colors: markerColors,
    })

    expect(output).toContain("<g>online </g>")
    expect(output).toContain("<y>offline</y>")
  })
})

describe("renderDeviceRevoked", () => {
  test("reports a newly revoked device", () => {
    expect(renderDeviceRevoked({ deviceId: "device_1", newlyRevoked: true })).toBe(
      "Revoked device device_1.",
    )
  })

  test("reports an already revoked device", () => {
    expect(renderDeviceRevoked({ deviceId: "device_1", newlyRevoked: false })).toBe(
      "Device device_1 was already revoked.",
    )
  })
})

describe("renderDeviceRevokeError", () => {
  test("maps a missing device to a friendly message", () => {
    expect(renderDeviceRevokeError({ kind: "device_not_found" })).toBe("No device matches that id.")
  })
})
