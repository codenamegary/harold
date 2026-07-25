import React from "react"
import { Link } from "react-router"
import { Panel } from "../design-system/Panel"

const textLinkClassName =
  "inline-flex min-h-9 items-center justify-center gap-3 rounded-[7px] bg-transparent px-3.5 text-base font-semibold whitespace-nowrap text-body-soft hover:text-lime"

export const OverviewPanels: React.FC = () => (
  <div className="grid grid-cols-[minmax(0,2fr)_minmax(265px,1fr)] gap-2.5 max-[1100px]:grid-cols-1">
    <Panel aria-label="Workspaces" className="col-span-1">
      <div className="flex h-[65px] items-center justify-between border-b border-line-soft px-[17px]">
        <div>
          <h3 className="m-0 text-[13px] font-semibold">Workspaces</h3>
          <p className="m-0 mt-[5px] text-[9px] text-dim">Agent activity across connected projects</p>
        </div>
        <Link className={textLinkClassName} to="/workspaces">
          Manage all <span aria-hidden>→</span>
        </Link>
      </div>
      <p className="m-0 px-[17px] py-6 text-sm text-[#697381]">No workspaces registered yet.</p>
    </Panel>

    <Panel aria-label="Recent activity">
      <div className="flex h-[65px] items-center justify-between border-b border-line-soft px-[17px]">
        <div>
          <h3 className="m-0 text-[13px] font-semibold">Recent activity</h3>
          <p className="m-0 mt-[5px] text-[9px] text-dim">Live event stream</p>
        </div>
      </div>
      <p className="m-0 px-[17px] py-6 text-sm text-[#697381]">No recent activity.</p>
    </Panel>
  </div>
)
