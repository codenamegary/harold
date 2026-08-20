import React from "react"
import { ArrowRight } from "lucide-react"
import { Link } from "react-router"
import { Panel } from "../design-system/Panel"
import { OverviewWorkspaceRow } from "./OverviewWorkspaceRow"
import { useOverviewWorkspacesQuery } from "../workspace/use.overview.workspaces.query"

const textLinkClassName =
  "inline-flex min-h-9 items-center justify-center gap-3 rounded-[7px] bg-transparent px-3.5 text-base font-semibold whitespace-nowrap text-body-soft hover:text-lime"

export const OverviewWorkspacePanel: React.FC = () => {
  const workspacesQuery = useOverviewWorkspacesQuery()
  const workspaces = workspacesQuery.data?.items ?? []

  return (
    <Panel aria-label="Workspaces" className="col-span-1">
      <div className="flex h-[65px] items-center justify-between border-b border-line-soft px-[17px]">
        <div>
          <h3 className="m-0 text-sm font-semibold">Workspaces</h3>
          <p className="m-0 mt-[5px] text-xs text-dim">Agent activity across connected projects</p>
        </div>
        <Link className={textLinkClassName} to="/workspaces">
          Manage all <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      {workspacesQuery.isLoading ? (
        <p className="m-0 px-[17px] py-6 text-sm text-[#697381]">Loading workspaces…</p>
      ) : workspacesQuery.isError ? (
        <p className="m-0 px-[17px] py-6 text-sm text-red-400" role="alert">
          Could not load workspaces.
        </p>
      ) : workspaces.length === 0 ? (
        <p className="m-0 px-[17px] py-6 text-sm text-[#697381]">No workspaces registered yet.</p>
      ) : (
        <div>
          {workspaces.map((workspace) => (
            <OverviewWorkspaceRow key={workspace.id} workspace={workspace} />
          ))}
        </div>
      )}
    </Panel>
  )
}
