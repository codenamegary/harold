import { describe, expect, test } from "bun:test"
import { Device } from "contracts/http/device"
import {
  renderDeviceList,
  renderDeviceNameNoMatch,
  renderDeviceRemoveError,
  renderDeviceRemoved,
  renderRemoveDevicesConfirmation,
} from "./device.render"

const colors = {
  green: (text: string) => text,
  yellow: (text: string) => text,
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
        aDevice({ id: "device_01JZYXWVUTSRQPONMLKJIHGF", name: "Pixel", state: "online" }),
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
    expect(output).toContain("online")
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
      dim: (text: string) => text,
    }

    renderDeviceList({
      devices: [aDevice({ state: "offline" }), aDevice({ state: "online" })],
      colors: recordingColors,
    })

    expect(calls).toContain("yellow:offline")
    expect(calls.some((call) => call.startsWith("green:online"))).toBe(true)
    expect(calls).not.toContain("green:offline")
  })

  test("pads the plain state before coloring so ANSI escapes keep columns aligned", () => {
    const markerColors = {
      green: (text: string) => `<g>${text}</g>`,
      yellow: (text: string) => `<y>${text}</y>`,
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

describe("renderDeviceRemoved", () => {
  test("reports the removed device by name and id", () => {
    expect(renderDeviceRemoved({ deviceId: "device_1", name: "Pixel" })).toBe(
      "Removed device Pixel (device_1).",
    )
  })
})

describe("renderDeviceRemoveError", () => {
  test("maps a missing device to a friendly message", () => {
    expect(renderDeviceRemoveError({ kind: "device_not_found" })).toBe("No device matches that id.")
  })
})

describe("renderDeviceNameNoMatch", () => {
  test("includes the name pattern that matched nothing", () => {
    expect(renderDeviceNameNoMatch("*gphone*")).toBe('No devices match name pattern "*gphone*".')
  })
})

describe("renderRemoveDevicesConfirmation", () => {
  test("counts name matches", () => {
    expect(
      renderRemoveDevicesConfirmation({
        count: 2,
        target: { kind: "name", pattern: "*gphone*" },
      }),
    ).toBe('Remove 2 devices matching "*gphone*"?')
  })

  test("counts one id match", () => {
    expect(
      renderRemoveDevicesConfirmation({
        count: 1,
        target: { kind: "id", deviceId: "device_1" },
      }),
    ).toBe("Remove 1 device with id device_1?")
  })
})
