import { AgentSettingsResult } from "./agent.settings.errors"
import { DeleteAgentSettingsRow, FindAgentSettingsRow } from "./agent.settings.ports"
import { isCatalogAgentId } from "./agent-registry"

export type RemoveAgent = (agentId: string) => AgentSettingsResult<void>

export type RemoveAgentDeps = Readonly<{
  findRow: FindAgentSettingsRow
  deleteRow: DeleteAgentSettingsRow
}>

export const makeRemoveAgent =
  (deps: RemoveAgentDeps): RemoveAgent =>
  (agentId) => {
    if (isCatalogAgentId(agentId)) {
      return { ok: false, error: { kind: "cannot_delete" } }
    }

    const current = deps.findRow(agentId)

    if (current === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    deps.deleteRow(agentId)

    return { ok: true, value: undefined }
  }
