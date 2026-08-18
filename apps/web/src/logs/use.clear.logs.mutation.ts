import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { clearLogs } from "./clear.logs"

export const useClearLogsMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: clearLogs,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.logsRoot })
    },
  })
}
