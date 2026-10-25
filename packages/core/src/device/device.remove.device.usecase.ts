import { CloseDeviceConnections, RemoveDeviceRow, RemoveDeviceRowResult } from "./device.ports"

export type RemoveDeviceCommand = Readonly<{
  deviceId: string
}>

export type RemoveDeviceResult = RemoveDeviceRowResult

export type RemoveDeviceDeps = Readonly<{
  removeDeviceRow: RemoveDeviceRow
  closeDeviceConnections: CloseDeviceConnections
}>

export const makeRemoveDevice =
  (deps: RemoveDeviceDeps) =>
  (command: RemoveDeviceCommand): RemoveDeviceResult => {
    const result = deps.removeDeviceRow({ deviceId: command.deviceId })

    if (!result.ok) {
      return result
    }

    deps.closeDeviceConnections(command.deviceId)
    return result
  }
