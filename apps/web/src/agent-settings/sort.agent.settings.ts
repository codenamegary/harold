import { AgentSettings } from "contracts/http/agent-settings"
import { isCustomAgentId } from "./is.custom.agent.id"

const bandRank = (item: AgentSettings): number => {
  if (item.enabled) {
    return 0
  }
  if (item.present) {
    return 1
  }
  if (item.popular) {
    return 2
  }
  return 3
}

export const sortAgentSettings = (items: readonly AgentSettings[]): AgentSettings[] => {
  const custom = items.filter((item) => isCustomAgentId(item.id))
  const rest = items.filter((item) => !isCustomAgentId(item.id))

  const sortedRest = [...rest].sort((left, right) => {
    const bandDiff = bandRank(left) - bandRank(right)
    if (bandDiff !== 0) {
      return bandDiff
    }
    return left.displayName.localeCompare(right.displayName)
  })

  return [...custom, ...sortedRest]
}
