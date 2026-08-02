import { devicePath } from "contracts/http/device"

export const revokeDevice = async (deviceId: string) => {
  const response = await fetch(devicePath(deviceId), {
    method: "DELETE",
  })

  if (response.status !== 204) {
    throw new Error(`Device revoke failed with ${response.status}`)
  }
}
