import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ImportApplyBody } from "contracts/http/agent-settings"
import { queryKeys } from "../query/query.keys"
import { applyAgentImport } from "./apply.agent.import"

export const useApplyAgentImportMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: ImportApplyBody) => applyAgentImport(body),
    onSuccess: (collection) => {
      queryClient.setQueryData(queryKeys.agentSettings(), collection)
    },
  })
}
