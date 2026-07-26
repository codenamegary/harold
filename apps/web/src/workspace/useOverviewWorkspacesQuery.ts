import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/queryKeys"
import { fetchWorkspaces } from "./fetchWorkspaces"

const OVERVIEW_WORKSPACE_LIMIT = 4

export const useOverviewWorkspacesQuery = () =>
  useQuery({
    queryKey: [...queryKeys.workspacesRoot, "overview"] as const,
    queryFn: () => fetchWorkspaces({ limit: OVERVIEW_WORKSPACE_LIMIT }),
  })
