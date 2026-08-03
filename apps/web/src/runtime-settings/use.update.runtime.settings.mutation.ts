import { useMutation, useQueryClient } from "@tanstack/react-query"
import { UpdateRuntimeSettingsBody } from "contracts/http/runtime-settings"
import { queryKeys } from "../query/query.keys"
import { updateRuntimeSettings } from "./update.runtime.settings"

export const useUpdateRuntimeSettingsMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: UpdateRuntimeSettingsBody) => updateRuntimeSettings(body),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.runtimeSettingsRoot })
    },
  })
}
