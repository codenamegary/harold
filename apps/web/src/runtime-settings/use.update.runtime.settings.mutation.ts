import { useMutation, useQueryClient } from "@tanstack/react-query"
import { UpdateRuntimeSettingsBody } from "contracts/http/runtime-settings"
import { queryKeys } from "../query/query.keys"
import { updateRuntimeSettings } from "./update.runtime.settings"

type UpdateRuntimeSettingsInput = {
  body: UpdateRuntimeSettingsBody
  force?: boolean
}

export const useUpdateRuntimeSettingsMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ body, force }: UpdateRuntimeSettingsInput) =>
      updateRuntimeSettings(body, { force }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.runtimeSettingsRoot })
    },
  })
}
