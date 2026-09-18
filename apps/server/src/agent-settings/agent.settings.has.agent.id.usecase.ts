import { catalogAgentsById } from "../acp/catalog/generated/catalog.agents.generated"
import { FindAgentSettingsRow } from "./agent.settings.ports"

export type HasAgentId = (agentId: string) => boolean

export type HasAgentIdDeps = Readonly<{
  findRow: FindAgentSettingsRow
}>

export const makeHasAgentId =
  (deps: HasAgentIdDeps): HasAgentId =>
  (agentId) => {
    if (Object.prototype.hasOwnProperty.call(catalogAgentsById, agentId)) {
      return true
    }

    return deps.findRow(agentId) !== undefined
  }
