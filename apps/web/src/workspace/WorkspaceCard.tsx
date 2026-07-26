import { Workspace } from "contracts/http/workspace"
import React from "react"
import { Panel } from "../design-system/Panel"
import { StatusPill } from "../design-system/StatusPill"
import { workspaceStateDisplayByState } from "./workspaceStateDisplay"

type WorkspaceCardProps = {
  workspace: Workspace
}

export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({ workspace }) => {
  const stateDisplay = workspaceStateDisplayByState[workspace.state]

  return (
    <Panel
      aria-label={`${workspace.name} workspace`}
      className="p-4"
      role="article"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="m-0 text-sm font-semibold text-white">{workspace.name}</h3>
        <StatusPill variant={stateDisplay.variant}>{stateDisplay.label}</StatusPill>
      </div>
      <p className="m-0 font-mono text-xs text-dim">{workspace.path}</p>
    </Panel>
  )
}
