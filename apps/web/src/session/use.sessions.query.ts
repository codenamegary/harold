import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchSessions } from "./fetch.sessions"

export const useSessionsQuery = (workspaceId?: string | null) => {
  const scopedWorkspaceId =
    workspaceId === null || workspaceId === undefined || workspaceId === ""
      ? undefined
      : workspaceId

  return useQuery({
    queryKey: queryKeys.sessions(scopedWorkspaceId),
    queryFn: () => fetchSessions(scopedWorkspaceId === undefined ? {} : { workspaceId: scopedWorkspaceId }),
  })
}
