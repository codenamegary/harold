import { Workspace } from "contracts/http/workspace"
import { useAtomValue } from "jotai"
import { Folder } from "lucide-react"
import React from "react"
import { nowAtom } from "../connection/now.atom"
import { StatusDot } from "../design-system/StatusDot"
import { formatRelativeLastUsed } from "../workspace/format.relative.last.used"
import { workspaceStateDisplayByState } from "../workspace/workspace.state.display"

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
          className="grid size-[31px] shrink-0 place-items-center rounded-md border border-[#2b3340] bg-[#171c23] text-lime"
        >
          <Folder className="size-4" />
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-sm font-medium text-white">
            {workspace.name}
          </strong>
          <small className="mt-[5px] block truncate font-mono text-xs text-dim">
            {workspace.path}
          </small>
        </div>
      </div>
      <div
        aria-hidden
        className="flex min-w-0 items-center gap-2.5 opacity-50 max-[1100px]:hidden"
      >
        <span className="grid size-[23px] shrink-0 place-items-center rounded-[5px] bg-violet/12 font-mono text-2xs text-violet-soft">
          --
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-sm font-medium text-white">
            Coming soon
          </strong>
          <small className="mt-[5px] block truncate text-xs text-dim">Agents not live</small>
        </div>
      </div>
      <div className="flex items-center gap-1.5 max-[1100px]:hidden">
        <StatusDot variant={stateDisplay.dotVariant} aria-label={stateDisplay.label} />
        <span className="text-xs text-muted">{stateDisplay.label}</span>
      </div>
      <div className="text-right font-mono text-xs whitespace-nowrap text-dim max-[1100px]:hidden">
        {formatRelativeLastUsed(workspace.lastUsedAt, workspace.createdAt, nowMs)}
      </div>
    </div>
  )
}
