import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchWorkspaces } from "./fetch.workspaces"

const OVERVIEW_WORKSPACE_LIMIT = 4

export const useOverviewWorkspacesQuery = () =>
  useQuery({
    queryKey: [...queryKeys.workspacesRoot, "overview"] as const,
    queryFn: () => fetchWorkspaces({ limit: OVERVIEW_WORKSPACE_LIMIT }),
  })
