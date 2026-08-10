import { AgentSettings } from "contracts/http/agent-settings"

export const filterAgentSettings = (
  agents: readonly AgentSettings[],
  query: string,
): AgentSettings[] => {
  const normalized = query.trim().toLowerCase()
  if (normalized.length === 0) {
    return [...agents]
  }

  return agents.filter((agent) => {
    const name = agent.displayName.toLowerCase()
    const id = agent.id.toLowerCase()
    return name.includes(normalized) || id.includes(normalized)
  })
}
