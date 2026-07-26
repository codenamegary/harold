import { Workspace } from "contracts/http/workspace"
import { useAtomValue } from "jotai"
import React from "react"
import { nowAtom } from "../connection/nowAtom"
import { StatusPill } from "../design-system/StatusPill"
import { formatRelativeLastUsed } from "../workspace/formatRelativeLastUsed"
import { workspaceStateDisplayByState } from "../workspace/workspaceStateDisplay"

type OverviewWorkspaceRowProps = {
  workspace: Workspace
}

export const OverviewWorkspaceRow: React.FC<OverviewWorkspaceRowProps> = ({ workspace }) => {
  const nowMs = useAtomValue(nowAtom)
  const stateDisplay = workspaceStateDisplayByState[workspace.state]

  return (
    <div className="grid min-h-[70px] grid-cols-[minmax(145px,1.35fr)_minmax(125px,1fr)_70px_58px] items-center gap-2 border-b border-line-soft px-[17px] last:border-b-0 max-[1100px]:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-[31px] shrink-0 place-items-center rounded-md border border-[#2b3340] bg-[#171c23] font-mono text-[13px] text-lime"
        >
          ⌘
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-[10px] font-medium text-white">
            {workspace.name}
          </strong>
          <small className="mt-[5px] block truncate font-mono text-[8px] text-dim">
            {workspace.path}
          </small>
        </div>
      </div>
      <div
        aria-hidden
        className="flex min-w-0 items-center gap-2.5 opacity-50 max-[1100px]:hidden"
      >
        <span className="grid size-[23px] shrink-0 place-items-center rounded-[5px] bg-violet/12 font-mono text-[8px] text-violet-soft">
          --
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-[10px] font-medium text-white">
            Coming soon
          </strong>
          <small className="mt-[5px] block truncate text-[8px] text-dim">Agents not live</small>
        </div>
      </div>
      <div className="max-[1100px]:hidden">
        <StatusPill variant={stateDisplay.variant}>{stateDisplay.label}</StatusPill>
      </div>
      <div className="text-right font-mono text-[8px] whitespace-nowrap text-dim max-[1100px]:hidden">
        {formatRelativeLastUsed(workspace.lastUsedAt, workspace.createdAt, nowMs)}
      </div>
    </div>
  )
}
