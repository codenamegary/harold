import React from "react"
import { UseMutationResult } from "@tanstack/react-query"
import { AgentSettings } from "contracts/http/agent-settings"
import { AgentSettingsRow } from "./AgentSettingsRow"
import { detectAgentPath } from "./detect.agent.path"
import { updateAgentSettings } from "./update.agent.settings"

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
  controlsDisabled: boolean
  updateMutation: UpdateMutation
  detectMutation: DetectMutation
}

export const AgentsTable: React.FC<AgentsTableProps> = ({
  agents,
  controlsDisabled,
  updateMutation,
  detectMutation,
}) => (
  <div className="overflow-x-auto rounded-[9px] border border-line-soft">
    <table className="w-full border-collapse text-left" role="table" aria-label="Agents">
      <thead>
        <tr className="border-b border-line-soft bg-[#0a0c10]">
          <th scope="col" className="px-3 py-2 text-2xs font-medium tracking-wide text-label">
            Agent
          </th>
          <th scope="col" className="px-3 py-2 text-2xs font-medium tracking-wide text-label">
            Presence
          </th>
          <th scope="col" className="px-3 py-2 text-2xs font-medium tracking-wide text-label">
            Path
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
        {agents.map((agent) => (
          <AgentSettingsRow
            key={agent.id}
            agent={agent}
            controlsDisabled={controlsDisabled}
            updateMutation={updateMutation}
            detectMutation={detectMutation}
          />
        ))}
      </tbody>
    </table>
  </div>
)
