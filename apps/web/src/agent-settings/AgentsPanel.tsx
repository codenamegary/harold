import React from "react"
import { useConnection } from "../connection/useConnection"
import { Panel } from "../design-system/Panel"
import { SectionKicker } from "../design-system/SectionKicker"
import { StatusPill } from "../design-system/StatusPill"
import { AgentSettingsCard } from "./AgentSettingsCard"
import { useAgentSettingsQuery } from "./useAgentSettingsQuery"
import { useDetectAgentPathMutation } from "./useDetectAgentPathMutation"
import { useUpdateAgentSettingsMutation } from "./useUpdateAgentSettingsMutation"

export const AgentsPanel: React.FC = () => {
  const { connection } = useConnection()
  const agentSettingsQuery = useAgentSettingsQuery()
  const updateMutation = useUpdateAgentSettingsMutation()
  const detectMutation = useDetectAgentPathMutation()
  const agents = agentSettingsQuery.data?.items ?? []
  const controlsDisabled =
    connection.phase === "unreachable" ||
    agentSettingsQuery.isLoading ||
    agentSettingsQuery.isError

  const enabledCount = agents.filter((agent) => agent.enabled).length

  return (
    <Panel className="mb-[25px] p-[22px]">
      <div className="mb-[22px] flex items-start justify-between gap-4 max-[820px]:flex-col">
        <div>
          <SectionKicker>AGENT RUNTIME</SectionKicker>
          <h3 className="m-0 text-lg font-semibold">Agents</h3>
          <p className="m-0 mt-2 max-w-2xl text-sm text-muted">
            Choose which agent runtimes ACP can start. Cursor needs a local executable path.
          </p>
        </div>
        <StatusPill variant={enabledCount > 0 ? "success" : undefined}>
          {agentSettingsQuery.isLoading
            ? "Loading…"
            : agentSettingsQuery.isError
              ? "Unavailable"
              : `${enabledCount} enabled`}
        </StatusPill>
      </div>

      {agentSettingsQuery.isError ? (
        <p className="m-0 mb-3.5 text-sm text-red-400" role="alert">
          Could not load agent settings.
        </p>
      ) : null}

      <div className="grid gap-3.5 lg:grid-cols-2">
        {agents.map((agent) => (
          <AgentSettingsCard
            key={agent.id}
            agent={agent}
            controlsDisabled={controlsDisabled}
            updateMutation={updateMutation}
            detectMutation={detectMutation}
          />
        ))}
      </div>
    </Panel>
  )
}
