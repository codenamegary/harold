import { AgentSettings } from "contracts/http/agent-settings"

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

export const sortAgentSettings = (items: readonly AgentSettings[]): AgentSettings[] =>
  [...items].sort((left, right) => {
    const bandDiff = bandRank(left) - bandRank(right)
    if (bandDiff !== 0) {
      return bandDiff
    }
    return left.displayName.localeCompare(right.displayName)
  })
