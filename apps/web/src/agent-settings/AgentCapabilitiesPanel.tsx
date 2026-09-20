import React from "react"
import {
  AgentCapabilityInventory,
  AgentCapabilityInventoryEntry,
  AgentRuntimeState,
} from "contracts/http/agent-settings"
import {
  agentCapabilitiesEmptyMessage,
  agentCapabilityGroupLabels,
  agentCapabilityGroupOrder,
  AgentCapabilityGroupKey,
  formatAgentCapabilityAgentInfoLabel,
  formatAgentCapabilityMethodsLabel,
  groupAgentCapabilities,
} from "./group.agent.capabilities"

type AgentCapabilitiesPanelProps = {
  agentDisplayName: string
  capabilities: AgentCapabilityInventory | null
  state: AgentRuntimeState
}

const CapabilityEntryRow: React.FC<{
  entry: AgentCapabilityInventoryEntry
  group: AgentCapabilityGroupKey
}> = ({ entry, group }) => {
  const methodsLabel = formatAgentCapabilityMethodsLabel(entry.requiredBy)
  const pathClassName =
    group === "missing" ? "font-mono text-xs text-amber" : "font-mono text-xs text-body"

  return (
    <li className="min-w-0">
      <p className={`m-0 truncate ${pathClassName}`} title={entry.path}>
        {entry.path}
      </p>
      {methodsLabel !== "" ? (
        <p className="m-0 truncate text-xs text-dim" title={methodsLabel}>
          {methodsLabel}
        </p>
      ) : null}
    </li>
  )
}

const CapabilityGroupSection: React.FC<{
  group: AgentCapabilityGroupKey
  entries: ReadonlyArray<AgentCapabilityInventoryEntry>
}> = ({ group, entries }) => (
  <section aria-label={agentCapabilityGroupLabels[group]}>
    <h4 className="m-0 mb-1.5 text-xs font-medium tracking-wide text-muted">
      {agentCapabilityGroupLabels[group]}
    </h4>
    {entries.length === 0 ? (
      <p className="m-0 text-xs text-dim">None</p>
    ) : (
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {entries.map((entry) => (
          <CapabilityEntryRow key={entry.path} entry={entry} group={group} />
        ))}
      </ul>
    )}
  </section>
)

export const AgentCapabilitiesPanel: React.FC<AgentCapabilitiesPanelProps> = ({
  agentDisplayName,
  capabilities,
  state,
}) => {
  if (capabilities === null) {
    return (
      <div aria-label={`${agentDisplayName} capabilities`} className="min-w-0">
        <p className="m-0 mb-1.5 text-xs font-medium tracking-wide text-muted">Capabilities</p>
        <p className="m-0 text-xs text-dim">{agentCapabilitiesEmptyMessage(state)}</p>
      </div>
    )
  }

  const groups = groupAgentCapabilities(capabilities)
  const agentInfoLabel = formatAgentCapabilityAgentInfoLabel(capabilities)

  return (
    <div aria-label={`${agentDisplayName} capabilities`} className="min-w-0">
      <p className="m-0 mb-1.5 text-xs font-medium tracking-wide text-muted">Capabilities</p>
      {agentInfoLabel !== "" ? (
        <p
          className="m-0 mb-3 font-mono text-xs text-dim"
          aria-label={`${agentDisplayName} agent info`}
        >
          {agentInfoLabel}
        </p>
      ) : null}
      <div className="flex flex-col gap-4">
        {agentCapabilityGroupOrder.map((group) => (
          <CapabilityGroupSection key={group} group={group} entries={groups[group]} />
        ))}
      </div>
    </div>
  )
}
