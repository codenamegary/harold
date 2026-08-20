import { WorkspaceState } from "contracts/http/workspace"
import { Search } from "lucide-react"
import React from "react"
import { useSearchParams } from "react-router"
import { TextInput } from "../design-system/TextInput"

const filterOptions = [
  { label: "All", value: undefined },
  { label: "Available", value: "available" },
  { label: "Missing", value: "missing" },
  { label: "Unavailable", value: "unavailable" },
] as const

export const WorkspacesToolbar: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeState = searchParams.get("state") ?? undefined
  const searchValue = searchParams.get("q") ?? ""

  const setSearchQuery = (value: string) => {
    const nextParams = new URLSearchParams(searchParams)
    if (value === "") {
      nextParams.delete("q")
    } else {
      nextParams.set("q", value)
    }
    setSearchParams(nextParams)
  }

  const setStateFilter = (state: WorkspaceState | undefined) => {
    const nextParams = new URLSearchParams(searchParams)
    if (state === undefined) {
      nextParams.delete("state")
    } else {
      nextParams.set("state", state)
    }
    setSearchParams(nextParams)
  }

  return (
    <div className="mb-[14px] flex justify-between gap-2 max-[640px]:gap-2">
      <label className="flex h-9 w-[260px] max-[640px]:min-w-0 max-[640px]:flex-1 items-center gap-2 rounded-[7px] border border-line bg-[#0c0f14] px-[11px] text-dim">
        <Search aria-hidden className="size-4" />
        <TextInput
          aria-label="Search workspaces"
          className="min-h-0 border-0 bg-transparent p-0 text-sm focus:border-transparent"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search workspaces…"
          role="searchbox"
          type="search"
          value={searchValue}
        />
      </label>
      <div
        aria-label="Workspace status filters"
        className="rounded-[7px] border border-line bg-[#0d1015] p-[3px]"
        role="group"
      >
        {filterOptions.map((option) => {
          const isActive = activeState === option.value

          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={isActive}
              onClick={() => setStateFilter(option.value)}
              className={`min-h-7 rounded-[5px] border-0 px-3 text-xs ${
                isActive
                  ? "bg-[#1b2029] text-[#c5ccd5]"
                  : "bg-transparent text-dim"
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
