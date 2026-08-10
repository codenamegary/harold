import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchRuntimeSettings } from "./fetch.runtime.settings"

export const useRuntimeSettingsQuery = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: queryKeys.runtimeSettings(),
    queryFn: fetchRuntimeSettings,
    enabled: options?.enabled ?? true,
  })
