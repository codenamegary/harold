import { deleteDevicePath } from "contracts/http/device"

export const deleteDevice = async (deviceId: string) => {
  const response = await fetch(deleteDevicePath(deviceId, { hardDelete: true }), {
    method: "DELETE",
  })

  if (response.status !== 204) {
    throw new Error(`Device delete failed with ${response.status}`)
  }
}
