import { eq } from "drizzle-orm"
import { AgentDatabase } from "../persistence/database"
import { agentSettings } from "../persistence/schema/agent-settings"
import {
  AgentSettingsRow,
  DeleteAgentSettingsRow,
  FindAgentSettingsRow,
  InsertAgentSettingsRow,
  ListAgentSettingsRows,
  UpdateAgentSettingsRow,
} from "core/agent-settings/ports"

type DrizzleAgentSettingsRow = typeof agentSettings.$inferSelect

const toRow = (row: DrizzleAgentSettingsRow): AgentSettingsRow => ({
  agentId: row.agentId,
  enabled: row.enabled,
  path: row.path,
  args: row.args,
  spawnSnapshot: row.spawnSnapshot,
  updatedAt: row.updatedAt,
})

export const makeListAgentSettingsRows =
  (database: AgentDatabase): ListAgentSettingsRows =>
  () =>
    database.db.select().from(agentSettings).all().map(toRow)

export const makeFindAgentSettingsRow =
  (database: AgentDatabase): FindAgentSettingsRow =>
  (agentId) => {
    const row = database.db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.agentId, agentId))
      .get()
    return row === undefined ? undefined : toRow(row)
  }

export const makeInsertAgentSettingsRow =
  (database: AgentDatabase): InsertAgentSettingsRow =>
  (input) => {
    database.db.insert(agentSettings).values(input).run()
  }

export const makeUpdateAgentSettingsRow =
  (database: AgentDatabase): UpdateAgentSettingsRow =>
  ({ agentId, patch }) => {
    const { agentId: nextAgentId, ...fields } = patch
    const set: Partial<DrizzleAgentSettingsRow> = { ...fields }
    if (nextAgentId !== undefined) {
      set.agentId = nextAgentId
    }

    database.db.update(agentSettings).set(set).where(eq(agentSettings.agentId, agentId)).run()
  }

export const makeDeleteAgentSettingsRow =
  (database: AgentDatabase): DeleteAgentSettingsRow =>
  (agentId) => {
    database.db.delete(agentSettings).where(eq(agentSettings.agentId, agentId)).run()
  }
