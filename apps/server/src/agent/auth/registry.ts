import { AgentId } from "contracts/http/agent-settings"
import { AuthAdapter } from "./adapters/adapter"
import { claudeAuthAdapter } from "./adapters/claude.adapter"
import { cursorAuthAdapter } from "./adapters/cursor.adapter"
import { defaultAuthAdapter } from "./adapters/default.adapter"

export const resolveAuthAdapter = (
  agentId: AgentId,
  adapters: ReadonlyArray<AuthAdapter> = [
    claudeAuthAdapter,
    cursorAuthAdapter,
    defaultAuthAdapter,
  ],
): AuthAdapter => {
  const matched = adapters.find((adapter) => adapter.matches(agentId))
  if (matched === undefined) {
    return defaultAuthAdapter
  }
  return matched
}
