import React from "react"
import { Panel } from "../design-system/Panel"

const tableHeaders = ["DEVICE", "LAST SEEN", "LOCATION", "STATUS", ""] as const

export const DeviceTable: React.FC = () => (
  <Panel className="table-panel">
    <div
      className="grid min-h-[38px] grid-cols-[minmax(180px,1.7fr)_0.8fr_0.8fr_80px_45px] items-center gap-3 border-b border-line-soft px-[17px] font-mono text-2xs text-[#515b68] max-[820px]:hidden"
      role="row"
    >
      {tableHeaders.map((header) => (
        <span key={header || "actions"} role="columnheader">
          {header}
        </span>
      ))}
    </div>
  </Panel>
)
