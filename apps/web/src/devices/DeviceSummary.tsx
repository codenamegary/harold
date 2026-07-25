import React from "react"
import { StatusDot } from "../design-system/StatusDot"

export const DeviceSummary: React.FC = () => (
  <div className="mb-[13px] grid grid-cols-[1.5fr_1fr_1fr] overflow-hidden rounded-lg border border-line-soft bg-panel max-[820px]:grid-cols-1">
    <div className="flex min-h-[65px] items-center gap-[9px] border-r border-line-soft px-[17px] text-sm max-[820px]:border-r-0 max-[820px]:border-b">
      <StatusDot variant="offline" />
      <strong>0 devices online</strong>
      <small className="text-xs text-dim">of 0 paired</small>
    </div>
    <div className="flex min-h-[65px] flex-col items-start justify-center gap-[5px] border-r border-line-soft px-[17px] text-sm max-[820px]:border-r-0 max-[820px]:border-b">
      <span className="text-xs text-dim">Last new pairing</span>
      <strong>None</strong>
    </div>
    <div className="flex min-h-[65px] flex-col items-start justify-center gap-[5px] px-[17px] text-sm">
      <span className="text-xs text-dim">Authentication</span>
      <strong className="text-lime">End-to-end encrypted</strong>
    </div>
  </div>
)
