import {
  CloseDeviceConnections,
  RevokeDeviceRow,
  RevokeDeviceRowResult,
} from "./device.ports"

export type RevokeDeviceCommand = Readonly<{
  deviceId: string
  hardDelete?: boolean
}>

export type RevokeDeviceResult = RevokeDeviceRowResult

export type RevokeDeviceDeps = Readonly<{
  revokeDeviceRow: RevokeDeviceRow
  closeDeviceConnections: CloseDeviceConnections
}>

export const makeRevokeDevice =
  (deps: RevokeDeviceDeps) =>
  (command: RevokeDeviceCommand): RevokeDeviceResult => {
    const result = deps.revokeDeviceRow({
      deviceId: command.deviceId,
      revokedAt: new Date().toISOString(),
      hardDelete: command.hardDelete === true,
    })

    if (!result.ok) {
      return result
    }

    deps.closeDeviceConnections(command.deviceId)
    return result
  }
