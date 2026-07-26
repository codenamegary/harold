import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CreateWorkspaceBody } from "contracts/http/workspace"
import { createWorkspace } from "./createWorkspace"

export const useCreateWorkspaceMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateWorkspaceBody) => createWorkspace(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspacesRoot })
    },
  })
}
