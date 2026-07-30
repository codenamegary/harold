import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchSessions } from "./fetch.sessions"

export const useSessionsQuery = (workspaceId: string | null) =>
  useQuery({
    queryKey: queryKeys.sessions(workspaceId ?? ""),
    queryFn: () => {
      if (workspaceId === null) {
        throw new Error("workspaceId is required")
      }
      return fetchSessions({ workspaceId })
    },
    enabled: workspaceId !== null,
  })
