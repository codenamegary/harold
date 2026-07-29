import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CreateWorkspaceBody } from "contracts/http/workspace"
import { queryKeys } from "../query/query.keys"
import { createWorkspace } from "./create.workspace"

export const useCreateWorkspaceMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateWorkspaceBody) => createWorkspace(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspacesRoot })
    },
  })
}
