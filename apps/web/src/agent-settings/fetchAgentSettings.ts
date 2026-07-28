import { AgentSettingsCollectionSchema } from "contracts/http/agent-settings"

export const fetchAgentSettings = async () => {
  const response = await fetch("/v1/settings/agents")

  if (!response.ok) {
    throw new Error(`Agent settings fetch failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return AgentSettingsCollectionSchema.parse(payload)
}
