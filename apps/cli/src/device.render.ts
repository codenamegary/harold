import { Device } from "contracts/http/device"
import { DeviceError } from "core/device/errors"

export type DeviceColors = Readonly<{
  green: (text: string) => string
  yellow: (text: string) => string
  dim: (text: string) => string
}>

export type RemoveDeviceTarget =
  | Readonly<{ kind: "id"; deviceId: string }>
  | Readonly<{ kind: "name"; pattern: string }>

const shortIdLength = "device_".length + 8

const shortDeviceId = (id: string): string => id.slice(0, shortIdLength)

const deviceCount = (count: number): string => `${count} device${count === 1 ? "" : "s"}`

export const renderDeviceList = (params: {
  devices: ReadonlyArray<Device>
  colors: DeviceColors
}): string => {
  const { devices, colors } = params

  if (devices.length === 0) {
    return "No devices paired yet."
  }

  const stateColor: Record<Device["state"], (text: string) => string> = {
    online: colors.green,
    offline: colors.yellow,
  }

  const header = ["ID", "NAME", "PLATFORM", "STATE", "PAIRED AT"]
  const stateColumn = 3
  const rows = devices.map((device) => [
    shortDeviceId(device.id),
    device.name,
    device.platform ?? "-",
    device.state,
    device.pairedAt,
  ])

  const widths = header.map((label, index) =>
    Math.max(label.length, ...rows.map((row) => row[index].length)),
  )

  const renderRow = (cells: readonly string[]): string => cells.join("  ")

  const padCells = (cells: readonly string[]): string[] =>
    cells.map((cell, index) => (index === cells.length - 1 ? cell : cell.padEnd(widths[index])))

  const lines = [
    colors.dim(renderRow(padCells(header))),
    ...rows.map((row, index) => {
      const device = devices[index]
      const padded = padCells(row)
      padded[stateColumn] = stateColor[device.state](padded[stateColumn])
      return renderRow(padded)
    }),
    "",
    colors.dim(deviceCount(devices.length)),
  ]

  return lines.join("\n")
}

export const renderDeviceRemoved = (params: { deviceId: string; name: string }): string =>
  `Removed device ${params.name} (${params.deviceId}).`

export const renderDeviceRemoveError = (error: DeviceError): string => {
  if (error.kind === "device_not_found") {
    return "No device matches that id."
  }
  return "Could not remove the device."
}

export const renderDeviceNameNoMatch = (pattern: string): string =>
  `No devices match name pattern "${pattern}".`

export const renderRemoveDevicesConfirmation = (params: {
  count: number
  target: RemoveDeviceTarget
}): string => {
  const { count, target } = params
  return target.kind === "name"
    ? `Remove ${deviceCount(count)} matching "${target.pattern}"?`
    : `Remove ${deviceCount(count)} with id ${target.deviceId}?`
}
