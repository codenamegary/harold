import React from "react"
import { Button } from "../design-system/Button"
import { Panel } from "../design-system/Panel"
import { Workspace } from "contracts/http/workspace"
import { WorkspaceCard } from "./WorkspaceCard"

type WorkspaceCardGridProps = {
  workspaces: Workspace[]
  loadedCount: number
  totalCount?: number
  isLoading: boolean
  isError: boolean
  hasActiveFilters: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
}

export const WorkspaceCardGrid: React.FC<WorkspaceCardGridProps> = ({
  workspaces,
  loadedCount,
  totalCount,
  isLoading,
  isError,
  hasActiveFilters,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}) => {
  if (isLoading) {
    return (
      <Panel className="col-span-full p-8 text-sm text-[#697381]">
        Loading workspaces…
      </Panel>
    )
  }

  if (isError) {
    return (
      <Panel className="col-span-full p-8 text-sm text-red-400" role="alert">
        Could not load workspaces.
      </Panel>
    )
  }

  if (workspaces.length === 0) {
    return (
      <Panel className="col-span-full p-8 text-sm text-[#697381]">
        {hasActiveFilters
          ? "No workspaces match your search or filters."
          : "No workspaces registered yet."}
      </Panel>
    )
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
        {workspaces.map((workspace) => (
          <WorkspaceCard key={workspace.id} workspace={workspace} />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="m-0 text-sm text-dim">
          {totalCount === undefined
            ? `${loadedCount} workspaces`
            : `${loadedCount} of ${totalCount} workspaces`}
        </p>
        <Button disabled={!hasNextPage || isFetchingNextPage} onClick={onLoadMore}>
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      </div>
    </>
  )
}
