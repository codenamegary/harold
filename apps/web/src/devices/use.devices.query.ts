import { useQuery } from "@tanstack/react-query"
import { DeviceState } from "contracts/http/device"
import { queryKeys } from "../query/query.keys"
import { fetchDevices } from "./fetch.devices"

type UseDevicesQueryParams = {
  state?: DeviceState
}

export const useDevicesQuery = (params: UseDevicesQueryParams = {}) =>
  useQuery({
    queryKey: queryKeys.devices(params),
    queryFn: () => fetchDevices(params),
  })
