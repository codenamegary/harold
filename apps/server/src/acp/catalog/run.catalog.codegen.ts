import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { buildCatalogEntries } from "./build.catalog.entries"
import { registrySnapshotSchema } from "./registry.schema"
import {
  renderAgentIdGenerated,
  renderAgentOverridesGenerated,
  renderCatalogAgentsGenerated,
} from "./render.catalog.codegen"

export type CatalogCodegenPaths = {
  readonly snapshotPath: string
  readonly contractsAgentIdPath: string
  readonly catalogAgentsPath: string
  readonly overrideSkeletonsPath: string
}

export const defaultCatalogCodegenPaths = (repoRoot: string): CatalogCodegenPaths => ({
  snapshotPath: path.join(
    repoRoot,
    "apps/server/src/acp/catalog/registry.snapshot.json",
  ),
  contractsAgentIdPath: path.join(
    repoRoot,
    "packages/contracts/src/http/agent.id.generated.ts",
  ),
  catalogAgentsPath: path.join(
    repoRoot,
    "apps/server/src/acp/catalog/generated/catalog.agents.generated.ts",
  ),
  overrideSkeletonsPath: path.join(
    repoRoot,
    "apps/server/src/acp/catalog/generated/agent.overrides.generated.ts",
  ),
})

export type CatalogCodegenResult = {
  readonly agentCount: number
  readonly agentIds: readonly string[]
  readonly paths: CatalogCodegenPaths
}

export const runCatalogCodegen = (
  paths: CatalogCodegenPaths,
): CatalogCodegenResult => {
  const snapshotJson = JSON.parse(readFileSync(paths.snapshotPath, "utf8"))
  const snapshot = registrySnapshotSchema.parse(snapshotJson)
  const entries = buildCatalogEntries(snapshot)

  mkdirSync(path.dirname(paths.contractsAgentIdPath), { recursive: true })
  mkdirSync(path.dirname(paths.catalogAgentsPath), { recursive: true })
  mkdirSync(path.dirname(paths.overrideSkeletonsPath), { recursive: true })

  writeFileSync(paths.contractsAgentIdPath, renderAgentIdGenerated(entries))
  writeFileSync(paths.catalogAgentsPath, renderCatalogAgentsGenerated(entries))
  writeFileSync(paths.overrideSkeletonsPath, renderAgentOverridesGenerated(entries))

  return {
    agentCount: entries.length,
    agentIds: entries.map((entry) => entry.id),
    paths,
  }
}
