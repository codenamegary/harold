import React, { useEffect, useState } from "react"
import { UseMutationResult } from "@tanstack/react-query"
import { AgentId, AgentSettings } from "contracts/http/agent-settings"
import { AgentSettingsRow } from "./AgentSettingsRow"
import { deleteAgentSettings } from "./delete.agent.settings"
import { detectAgentPath } from "./detect.agent.path"
import { respawnAgent } from "./respawn.agent"
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

type DeleteMutation = UseMutationResult<
  Awaited<ReturnType<typeof deleteAgentSettings>>,
  Error,
  AgentId
>

type RespawnMutation = UseMutationResult<Awaited<ReturnType<typeof respawnAgent>>, Error, AgentId>

type AgentsTableProps = {
  agents: readonly AgentSettings[]
  searchQuery: string
  controlsDisabled: boolean
  initiallyExpandedAgentId: string | null
  updateMutation: UpdateMutation
  detectMutation: DetectMutation
  deleteMutation: DeleteMutation
  respawnMutation: RespawnMutation
}

export const AgentsTable: React.FC<AgentsTableProps> = ({
  agents,
  searchQuery,
  controlsDisabled,
  initiallyExpandedAgentId,
  updateMutation,
  detectMutation,
  deleteMutation,
  respawnMutation,
}) => {
  const [visibleCount, setVisibleCount] = useState(pageSize)

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [searchQuery])

  const visibleAgents = agents.slice(0, visibleCount)
  const remainingCount = Math.max(0, agents.length - visibleCount)
  const hasMore = remainingCount > 0

  return (
    <div className="overflow-x-auto rounded-lg border border-line-soft">
      <table className="w-full border-collapse text-left" role="table" aria-label="Agents">
        <thead>
          <tr className="border-b border-line-soft bg-surface-deep">
            <th scope="col" className="px-3 py-2 text-xs font-medium tracking-wide text-muted">
              Agent
            </th>
            <th scope="col" className="px-3 py-2 text-xs font-medium tracking-wide text-muted">
              Launch
            </th>
            <th scope="col" className="px-3 py-2 text-xs font-medium tracking-wide text-muted">
              Status
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right text-xs font-medium tracking-wide text-muted"
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
              initiallyExpanded={agent.id === initiallyExpandedAgentId}
              updateMutation={updateMutation}
              detectMutation={detectMutation}
              deleteMutation={deleteMutation}
              respawnMutation={respawnMutation}
            />
          ))}
          {hasMore ? (
            <tr className="border-t border-line-soft">
              <td colSpan={4} className="px-3 py-2.5 text-center">
                <button
                  type="button"
                  className="inline-flex min-h-6 items-center justify-center rounded-md bg-transparent px-0 text-xs font-semibold text-body-soft transition-opacity duration-300 ease-out hover:text-lime cursor-pointer"
                  aria-label={`Load more agents, ${remainingCount} remaining`}
                  onClick={() => setVisibleCount((count) => count + pageSize)}
                >
                  Show more ({remainingCount})
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
