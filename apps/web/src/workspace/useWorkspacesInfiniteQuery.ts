import { useInfiniteQuery } from "@tanstack/react-query"
import { WorkspaceState } from "contracts/http/workspace"
import { queryKeys } from "../query/queryKeys"
import { fetchWorkspaces } from "./fetchWorkspaces"

export type WorkspaceListFilters = {
  q?: string
  state?: WorkspaceState
}

const WORKSPACE_PAGE_LIMIT = 20

export const useWorkspacesInfiniteQuery = (filters: WorkspaceListFilters) =>
  useInfiniteQuery({
    queryKey: queryKeys.workspaces(filters),
    queryFn: ({ pageParam }) =>
      fetchWorkspaces({
        ...filters,
        cursor: pageParam,
        limit: WORKSPACE_PAGE_LIMIT,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page.nextCursor,
  })
