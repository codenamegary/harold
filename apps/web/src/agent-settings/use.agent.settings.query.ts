import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchAgentSettings } from "./fetch.agent.settings"

export const useAgentSettingsQuery = () =>
  useQuery({
    queryKey: queryKeys.agentSettings(),
    queryFn: fetchAgentSettings,
  })
