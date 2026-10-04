import { AgentSpawnSnapshot, ImportDetectResponse } from "contracts/http/agent-settings"
import { registrySnapshotSchema } from "../agent-catalog/registry.schema"
import { resolveCatalogSpawn } from "../agent-catalog/resolve.catalog.spawn"
import { isCatalogAgentId } from "./agent-registry"
import { AgentSettingsResult } from "./agent.settings.errors"
import { FetchRegistryFn, ListAgentSettingsRows, ProbeAgentPresence } from "./agent.settings.ports"

export type DetectImportableAgents = () => Promise<AgentSettingsResult<ImportDetectResponse>>

export type DetectImportableAgentsDeps = Readonly<{
  listRows: ListAgentSettingsRows
  probePresence: ProbeAgentPresence
  fetchRegistry: FetchRegistryFn
  registryUrl: string
}>

export const makeDetectImportableAgents =
  (deps: DetectImportableAgentsDeps): DetectImportableAgents =>
  async () => {
    try {
      const payload = await deps.fetchRegistry(deps.registryUrl)
      const snapshot = registrySnapshotSchema.parse(payload)
      const rows = deps.listRows()
      const rowsById = new Map(rows.map((row) => [row.agentId, row]))

      const items = snapshot.agents.map((agent) => {
        const spawn = resolveCatalogSpawn(agent)
        const spawnSnapshot: AgentSpawnSnapshot = {
          kind: spawn.kind,
          binaryName: spawn.binaryName,
          command: [...spawn.command],
          displayName: agent.name,
          authMethodId: agent.id,
        }
        const presence = deps.probePresence(agent.id, spawnSnapshot)
        const row = rowsById.get(agent.id)

        return {
          id: agent.id,
          displayName: agent.name,
          present: presence.present,
          path: presence.path,
          inCatalog: isCatalogAgentId(agent.id),
          alreadyEnabled: row?.enabled ?? false,
          spawn: spawnSnapshot,
        }
      })

      return {
        ok: true,
        value: {
          items: items.filter((item) => item.present),
        },
      }
    } catch {
      return { ok: false, error: { kind: "registry_fetch_failed" } }
    }
  }
