import { FastifyInstance } from "fastify"
import { AgentDatabase } from "../persistence/database"
import { ensureCatalogAgentSettingsRows } from "../acp/catalog/catalog.sqlite.adapters"
import { probePresence } from "core/agent-catalog/probe.presence"
import { PresenceProbeContext } from "core/agent-catalog/profile.override"
import { AuthBroker } from "../agent/auth/broker"
import { AcpSupervisor } from "../acp/supervisor/supervisor.ports"
import {
  makeDeleteAgentSettingsRow,
  makeFindAgentSettingsRow,
  makeInsertAgentSettingsRow,
  makeListAgentSettingsRows,
  makeUpdateAgentSettingsRow,
} from "./agent.settings.sqlite.adapters"
import { makeAgentSettingsView } from "core/agent-settings/view"
import { makeListAgentSettings, ListAgentSettings } from "core/agent-settings/list.usecase"
import { makeHasAgentId, HasAgentId } from "core/agent-settings/has.agent.id.usecase"
import {
  makeGetSpawnSnapshot,
  GetSpawnSnapshot,
} from "core/agent-settings/get.spawn.snapshot.usecase"
import { makeDetectAgentPath } from "core/agent-settings/detect.path.usecase"
import { makeCreateCustomAgent, CreateCustomAgent } from "core/agent-settings/create.custom.usecase"
import { makeUpdateAgentSettings } from "core/agent-settings/update.usecase"
import { makeRemoveAgent } from "core/agent-settings/remove.usecase"
import { makeDetectImportableAgents } from "core/agent-settings/import.detect.usecase"
import { makeApplyImportedAgents } from "core/agent-settings/import.apply.usecase"
import { registerAgentSettingsRoutes } from "./agent.settings.routes"
import {
  defaultAcpRegistryUrl,
  FetchRegistryFn,
  ProbeAgentPresence,
} from "core/agent-settings/ports"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import {
  validateExecutablePath,
  ValidateExecutablePathFn,
} from "core/agent-settings/validate-agent-path"

export type AssembleAgentSettingsSliceDeps = Readonly<{
  database: AgentDatabase
  acpSupervisor: () => AcpSupervisor
  authBroker: () => AuthBroker
  whichFn?: WhichFn
  env?: Readonly<Record<string, string | undefined>>
  validateExecutablePathFn?: ValidateExecutablePathFn
  fetchRegistryFn?: FetchRegistryFn
  registryUrl?: string
}>

export type AgentSettingsSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
  list: ListAgentSettings
  hasAgentId: HasAgentId
  getSpawnSnapshot: GetSpawnSnapshot
  createCustomAgent: CreateCustomAgent
}>

export const assembleAgentSettingsSlice = (
  deps: AssembleAgentSettingsSliceDeps,
): AgentSettingsSlice => {
  ensureCatalogAgentSettingsRows(deps.database)

  const whichFn: WhichFn = deps.whichFn ?? ((name) => Bun.which(name))
  const validatePath: ValidateExecutablePathFn =
    deps.validateExecutablePathFn ?? validateExecutablePath
  const env = deps.env ?? process.env
  const fetchRegistry: FetchRegistryFn =
    deps.fetchRegistryFn ??
    (async (url: string) => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`registry fetch failed: ${response.status}`)
      }
      return response.json()
    })
  const registryUrl = deps.registryUrl ?? defaultAcpRegistryUrl

  const presenceCtx = (): PresenceProbeContext => ({ which: whichFn, env })
  const probeAgentPresence: ProbeAgentPresence = (agentId, spawn) =>
    probePresence(agentId, presenceCtx(), spawn)

  const listRows = makeListAgentSettingsRows(deps.database)
  const findRow = makeFindAgentSettingsRow(deps.database)
  const insertRow = makeInsertAgentSettingsRow(deps.database)
  const updateRow = makeUpdateAgentSettingsRow(deps.database)
  const deleteRow = makeDeleteAgentSettingsRow(deps.database)

  const buildView = makeAgentSettingsView({ probePresence: probeAgentPresence, validatePath })

  const list = makeListAgentSettings({ listRows, buildView })
  const hasAgentId = makeHasAgentId({ findRow })
  const getSpawnSnapshot = makeGetSpawnSnapshot({ findRow })
  const detectAgentPath = makeDetectAgentPath({ findRow, whichFn, validatePath })
  const createCustomAgent = makeCreateCustomAgent({ listRows, findRow, insertRow, buildView })
  const updateAgentSettings = makeUpdateAgentSettings({
    listRows,
    findRow,
    updateRow,
    buildView,
    whichFn,
    validatePath,
  })
  const removeAgent = makeRemoveAgent({ findRow, deleteRow })
  const detectImportableAgents = makeDetectImportableAgents({
    listRows,
    probePresence: probeAgentPresence,
    fetchRegistry,
    registryUrl,
  })
  const applyImportedAgents = makeApplyImportedAgents({
    findRow,
    insertRow,
    updateRow,
    list,
    validatePath,
  })

  return {
    registerRoutes: (app) => {
      registerAgentSettingsRoutes(app, {
        list,
        createCustomAgent,
        detectImportableAgents,
        applyImportedAgents,
        detectAgentPath,
        updateAgentSettings,
        removeAgent,
        acpSupervisor: deps.acpSupervisor(),
        authBroker: deps.authBroker(),
      })
    },
    list,
    hasAgentId,
    getSpawnSnapshot,
    createCustomAgent,
  }
}
