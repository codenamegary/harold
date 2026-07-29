import { useMutation, useQueryClient } from "@tanstack/react-query"
import { UpdateWorkspaceBody } from "contracts/http/workspace"
import { queryKeys } from "../query/query.keys"
import { updateWorkspace } from "./update.workspace"

type UpdateWorkspaceInput = {
  workspaceId: string
  body: UpdateWorkspaceBody
}

export const useUpdateWorkspaceMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ workspaceId, body }: UpdateWorkspaceInput) =>
      updateWorkspace(workspaceId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspacesRoot })
    },
  })
}
