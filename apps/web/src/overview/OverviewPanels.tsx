import React from "react"
import { OverviewWorkspacePanel } from "./OverviewWorkspacePanel"

export const OverviewPanels: React.FC = () => (
  <div className="grid grid-cols-[minmax(0,2fr)_minmax(265px,1fr)] gap-2.5 max-[1100px]:grid-cols-1">
    <OverviewWorkspacePanel />

    <section
      aria-label="Recent activity"
      className="overflow-hidden rounded-[9px] border border-line-soft bg-panel"
    >
      <div className="flex h-[65px] items-center justify-between border-b border-line-soft px-[17px]">
        <div>
          <h3 className="m-0 text-[13px] font-semibold">Recent activity</h3>
          <p className="m-0 mt-[5px] text-[9px] text-dim">Live event stream</p>
        </div>
      </div>
      <p className="m-0 px-[17px] py-6 text-sm text-[#697381]">No recent activity.</p>
    </section>
  </div>
)
