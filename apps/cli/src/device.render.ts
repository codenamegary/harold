import { Device } from "contracts/http/device"
import { DeviceError } from "core/device/errors"

export type DeviceColors = Readonly<{
  green: (text: string) => string
  yellow: (text: string) => string
  red: (text: string) => string
  dim: (text: string) => string
}>

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
    revoked: colors.red,
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

  const renderRow = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => (index === cells.length - 1 ? cell : cell.padEnd(widths[index])))
      .join("  ")

  const lines = [
    colors.dim(renderRow(header)),
    ...rows.map((row, index) => {
      const device = devices[index]
      const colored = [...row]
      colored[stateColumn] = stateColor[device.state](device.state)
      return renderRow(colored)
    }),
    "",
    colors.dim(deviceCount(devices.length)),
  ]

  return lines.join("\n")
}

export const renderDeviceRevoked = (params: { deviceId: string; newlyRevoked: boolean }): string =>
  params.newlyRevoked
    ? `Revoked device ${params.deviceId}.`
    : `Device ${params.deviceId} was already revoked.`

export const renderDeviceRevokeError = (error: DeviceError): string => {
  if (error.kind === "device_not_found") {
    return "No device matches that id."
  }
  return "Could not revoke the device."
}
