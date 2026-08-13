import { Device } from "contracts/http/device"

export const findNewlyPairedDevice = (params: {
  baselineIds: ReadonlySet<string>
  devices: ReadonlyArray<Device>
}): Device | undefined => {
  const newcomers = params.devices.filter(
    (device) => !params.baselineIds.has(device.id) && device.state !== "revoked",
  )

  if (newcomers.length === 0) {
    return undefined
  }

  return newcomers.reduce((latest, device) =>
    device.pairedAt > latest.pairedAt ? device : latest,
  )
}
