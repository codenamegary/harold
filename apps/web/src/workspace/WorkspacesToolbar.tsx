import React from "react"
import { TextInput } from "../design-system/TextInput"

const filterOptions = ["All", "Active", "Paused"] as const

export const WorkspacesToolbar: React.FC = () => (
  <div className="mb-[14px] flex justify-between gap-2 max-[640px]:gap-2">
    <label className="flex h-9 w-[260px] max-[640px]:min-w-0 max-[640px]:flex-1 items-center gap-2 rounded-[7px] border border-line bg-[#0c0f14] px-[11px] text-dim">
      <span aria-hidden>⌕</span>
      <TextInput
        aria-label="Search workspaces"
        className="min-h-0 border-0 bg-transparent p-0 text-[10px] focus:border-transparent"
        disabled
        placeholder="Search workspaces…"
        role="searchbox"
        type="search"
      />
    </label>
    <div
      aria-label="Workspace status filters"
      className="rounded-[7px] border border-line bg-[#0d1015] p-[3px]"
      role="group"
    >
      {filterOptions.map((option) => (
        <button
          key={option}
          type="button"
          disabled
          aria-pressed={option === "All"}
          className={`min-h-7 rounded-[5px] border-0 px-3 text-[9px] ${
            option === "All"
              ? "bg-[#1b2029] text-[#c5ccd5]"
              : "bg-transparent text-dim max-[640px]:hidden"
          } opacity-50`}
        >
          {option}
        </button>
      ))}
    </div>
  </div>
)
