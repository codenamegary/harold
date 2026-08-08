import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { deleteDevice } from "./delete.device"

export const useDeleteDeviceMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (deviceId: string) => deleteDevice(deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.devicesRoot })
    },
  })
}
