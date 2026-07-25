import React from "react"
import { Panel } from "../design-system/Panel"

export const WorkspaceCardGrid: React.FC = () => (
  <div className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
    <Panel className="col-span-full p-8 text-sm text-[#697381]">
      No workspaces registered yet.
    </Panel>
  </div>
)
