import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchRuntimeSettings } from "./fetch.runtime.settings"

export const useRuntimeSettingsQuery = () =>
  useQuery({
    queryKey: queryKeys.runtimeSettings(),
    queryFn: fetchRuntimeSettings,
  })
