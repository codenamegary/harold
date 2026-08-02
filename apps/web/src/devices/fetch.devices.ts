import {
  DEVICES_PATH,
  DeviceCollectionSchema,
  DeviceState,
} from "contracts/http/device"

export type FetchDevicesParams = {
  state?: DeviceState
}

export const fetchDevices = async (params: FetchDevicesParams = {}) => {
  const searchParams = new URLSearchParams()

  if (params.state !== undefined) {
    searchParams.set("state", params.state)
  }

  const query = searchParams.toString()
  const url = query === "" ? DEVICES_PATH : `${DEVICES_PATH}?${query}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Devices fetch failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return DeviceCollectionSchema.parse(payload)
}
