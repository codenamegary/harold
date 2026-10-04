import { CatalogSpawn, resolveCatalogSpawn } from "./resolve.catalog.spawn"
import { RegistryAgent, RegistrySnapshot } from "./registry.schema"

export type CatalogAgentEntry = {
  readonly id: string
  readonly displayName: string
  readonly description: string | null
  readonly version: string | null
  readonly icon: string | null
  readonly available: true
  readonly spawn: CatalogSpawn
  readonly authMethodId: string
}

export const toCatalogAgentEntry = (agent: RegistryAgent): CatalogAgentEntry => {
  const spawn = resolveCatalogSpawn(agent)

  return {
    id: agent.id,
    displayName: agent.name,
    description: agent.description ?? null,
    version: agent.version ?? null,
    icon: agent.icon ?? null,
    available: true,
    spawn,
    authMethodId: agent.id,
  }
}

export const buildCatalogEntries = (snapshot: RegistrySnapshot): readonly CatalogAgentEntry[] =>
  snapshot.agents
    .map(toCatalogAgentEntry)
    .toSorted((left, right) => left.id.localeCompare(right.id))
