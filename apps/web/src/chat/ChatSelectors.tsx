import React from "react"

export const ChatSelectors: React.FC = () => (
  <div className="flex items-center gap-2">
    <label className="h-[43px] min-w-[145px] rounded-md border border-line bg-[#0b0e12] px-[9px] py-1.5 max-[820px]:min-w-0 max-[820px]:w-[100px]">
      <span className="mb-[3px] block font-mono text-[7px] text-dim">Workspace</span>
      <select
        aria-label="Workspace"
        disabled
        defaultValue=""
        className="block w-full appearance-none border-0 bg-transparent text-[9px] text-[#c3cad3] outline-0"
      />
    </label>
    <label className="h-[43px] min-w-[145px] rounded-md border border-line bg-[#0b0e12] px-[9px] py-1.5 max-[820px]:hidden">
      <span className="mb-[3px] block font-mono text-[7px] text-dim">Agent</span>
      <select
        aria-label="Agent"
        disabled
        defaultValue=""
        className="block w-full appearance-none border-0 bg-transparent text-[9px] text-[#c3cad3] outline-0"
      />
    </label>
  </div>
)
