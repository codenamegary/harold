import { AgentDatabase } from "../../persistence/database"
import { agentSettings } from "../../persistence/schema/agent-settings"
import { catalogAgentIds } from "core/agent-catalog/generated"

const nowIso = () => new Date().toISOString()

/**
 * Ensures every catalog agent has an agent_settings row.
 * Additive and idempotent. Safe across registry syncs.
 */
export const ensureCatalogAgentSettingsRows = (database: AgentDatabase): void => {
  const updatedAt = nowIso()

  for (const agentId of catalogAgentIds) {
    database.db
      .insert(agentSettings)
      .values({
        agentId,
        enabled: false,
        path: null,
        updatedAt,
      })
      .onConflictDoNothing()
      .run()
  }
}
