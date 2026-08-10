import React, { useEffect, useState } from "react"
import { UseMutationResult } from "@tanstack/react-query"
import { AgentSettings } from "contracts/http/agent-settings"
import { AgentSettingsRow } from "./AgentSettingsRow"
import { detectAgentPath } from "./detect.agent.path"
import { updateAgentSettings } from "./update.agent.settings"

const pageSize = 10

type UpdateMutation = UseMutationResult<
  Awaited<ReturnType<typeof updateAgentSettings>>,
  Error,
  Parameters<typeof updateAgentSettings>[0]
>

type DetectMutation = UseMutationResult<
  Awaited<ReturnType<typeof detectAgentPath>>,
  Error,
  Parameters<typeof detectAgentPath>[0]
>

type AgentsTableProps = {
  agents: readonly AgentSettings[]
  searchQuery: string
  controlsDisabled: boolean
  updateMutation: UpdateMutation
  detectMutation: DetectMutation
}

export const AgentsTable: React.FC<AgentsTableProps> = ({
  agents,
  searchQuery,
  controlsDisabled,
  updateMutation,
  detectMutation,
}) => {
  const [visibleCount, setVisibleCount] = useState(pageSize)

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [searchQuery])

  const visibleAgents = agents.slice(0, visibleCount)
  const remainingCount = Math.max(0, agents.length - visibleCount)
  const hasMore = remainingCount > 0

  return (
    <div className="overflow-x-auto rounded-[9px] border border-line-soft">
      <table className="w-full border-collapse text-left" role="table" aria-label="Agents">
        <thead>
          <tr className="border-b border-line-soft bg-[#0a0c10]">
            <th scope="col" className="px-3 py-2 text-2xs font-medium tracking-wide text-label">
              Agent
            </th>
            <th scope="col" className="px-3 py-2 text-2xs font-medium tracking-wide text-label">
              Launch
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right text-2xs font-medium tracking-wide text-label"
            >
              Enable
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleAgents.map((agent) => (
            <AgentSettingsRow
              key={agent.id}
              agent={agent}
              controlsDisabled={controlsDisabled}
              updateMutation={updateMutation}
              detectMutation={detectMutation}
            />
          ))}
          {hasMore ? (
            <tr className="border-t border-line-soft">
              <td colSpan={3} className="px-3 py-2.5 text-center">
                <button
                  type="button"
                  className="inline-flex min-h-6 cursor-pointer items-center justify-center rounded-[7px] bg-transparent px-2 text-2xs font-semibold text-body-soft transition-opacity duration-300 ease-out hover:text-lime"
                  aria-label={`Load more agents, ${remainingCount} remaining`}
                  onClick={() => setVisibleCount((count) => count + pageSize)}
                >
                  Load more
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
