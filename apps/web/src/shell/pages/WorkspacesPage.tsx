import { WorkspaceState } from "contracts/http/workspace"
import React, { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { AddWorkspaceModal } from "../../workspace/AddWorkspaceModal"
import { useWorkspacesInfiniteQuery } from "../../workspace/use.workspaces.infinite.query"
import { WorkspaceCardGrid } from "../../workspace/WorkspaceCardGrid"
import { WorkspacesPageIntro } from "../../workspace/WorkspacesPageIntro"
import { WorkspacesToolbar } from "../../workspace/WorkspacesToolbar"

const parseWorkspaceState = (value: string | null): WorkspaceState | undefined => {
  if (value === "available" || value === "missing" || value === "unavailable") {
    return value
  }

  return undefined
}

export const WorkspacesPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const filters = useMemo(
    () => ({
      q: searchParams.get("q") ?? undefined,
      state: parseWorkspaceState(searchParams.get("state")),
    }),
    [searchParams],
  )
  const workspacesQuery = useWorkspacesInfiniteQuery(filters)
  const workspaces = workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []
  const totalCount = workspacesQuery.data?.pages[0]?.page.count
  const hasActiveFilters = filters.q !== undefined || filters.state !== undefined

  return (
    <main>
      <WorkspacesPageIntro onAddWorkspace={() => setIsAddModalOpen(true)} />
      <WorkspacesToolbar />
      <WorkspaceCardGrid
        workspaces={workspaces}
        loadedCount={workspaces.length}
        totalCount={totalCount}
        isLoading={workspacesQuery.isLoading}
        isError={workspacesQuery.isError}
        hasActiveFilters={hasActiveFilters}
        hasNextPage={workspacesQuery.hasNextPage}
        isFetchingNextPage={workspacesQuery.isFetchingNextPage}
        onLoadMore={() => {
          void workspacesQuery.fetchNextPage()
        }}
      />
      <AddWorkspaceModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </main>
  )
}
