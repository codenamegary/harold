import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../query/queryKeys"
import { deleteWorkspace } from "./deleteWorkspace"

export const useDeleteWorkspaceMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (workspaceId: string) => deleteWorkspace(workspaceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspacesRoot })
    },
  })
}
