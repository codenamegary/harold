import path from "node:path"
import { defaultCatalogCodegenPaths, runCatalogCodegen } from "./run.catalog.codegen"

const repoRoot = path.resolve(import.meta.dir, "../../../..")
const result = runCatalogCodegen(defaultCatalogCodegenPaths(repoRoot))

console.log(
  `ACP catalog codegen wrote ${result.agentCount} agents to:\n` +
    `- ${result.paths.contractsAgentIdPath}\n` +
    `- ${result.paths.catalogAgentsPath}\n` +
    `- ${result.paths.overrideSkeletonsPath}`,
)
