import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/queryKeys"
import { fetchAgentSettings } from "./fetchAgentSettings"

export const useAgentSettingsQuery = () =>
  useQuery({
    queryKey: queryKeys.agentSettings(),
    queryFn: fetchAgentSettings,
  })
