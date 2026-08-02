import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { revokeDevice } from "./revoke.device"

export const useRevokeDeviceMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (deviceId: string) => revokeDevice(deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.devicesRoot })
    },
  })
}
