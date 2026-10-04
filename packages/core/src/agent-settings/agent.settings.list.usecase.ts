import { AgentSettings } from "contracts/http/agent-settings"
import { catalogAgentsById } from "../agent-catalog/generated/catalog.agents.generated"
import { isCatalogAgentId, sortAgentSettingsBands } from "./agent-registry"
import { isCustomAgentId } from "./custom.agent.id"
import { BuildAgentSettingsView, ListAgentSettingsRows } from "./agent.settings.ports"

export type ListAgentSettings = () => AgentSettings[]

export type ListAgentSettingsDeps = Readonly<{
  listRows: ListAgentSettingsRows
  buildView: BuildAgentSettingsView
}>

export const makeListAgentSettings =
  (deps: ListAgentSettingsDeps): ListAgentSettings =>
  () => {
    const rows = deps.listRows()
    const rowsById = new Map(rows.map((row) => [row.agentId, row]))

    const catalogItems = Object.keys(catalogAgentsById).map((agentId) =>
      deps.buildView(agentId, rowsById.get(agentId)),
    )

    const nonCatalogRows = rows.filter((row) => !isCatalogAgentId(row.agentId))
    const customRows = nonCatalogRows
      .filter((row) => isCustomAgentId(row.agentId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    const registryAheadRows = nonCatalogRows.filter((row) => !isCustomAgentId(row.agentId))

    const customItems = customRows.map((row) => deps.buildView(row.agentId, row))
    const registryAheadItems = registryAheadRows.map((row) => deps.buildView(row.agentId, row))

    return [...customItems, ...sortAgentSettingsBands([...catalogItems, ...registryAheadItems])]
  }
