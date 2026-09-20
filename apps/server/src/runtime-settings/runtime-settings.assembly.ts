import { FastifyInstance } from "fastify"
import { makeCanonicalizePath } from "../filesystem/filesystem.node.adapters"
import { EnvBindOverrides } from "../config/env.bind.overrides"
import { DeleteWorkspace, ListAllWorkspaces } from "../workspace/workspace.ports"
import { AppliedRuntimeSettingsHolder } from "./applied.runtime.settings"
import { registerRuntimeSettingsRoutes } from "./runtime-settings.routes"
import { RuntimeSettingsFileStore } from "./runtime-settings.file.adapters"
import { GetRuntimeSettings, OnLogLevelChanged } from "./runtime-settings.ports"
import { makeUpdateRuntimeSettings } from "./runtime-settings.update.usecase"

export type AssembleRuntimeSettingsSliceDeps = Readonly<{
  store: RuntimeSettingsFileStore
  listAllWorkspaces: ListAllWorkspaces
  deleteWorkspace: DeleteWorkspace
  onLogLevelChanged?: OnLogLevelChanged
  appliedRuntimeSettings?: AppliedRuntimeSettingsHolder
  envBindOverrides?: EnvBindOverrides
}>

export type RuntimeSettingsSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
  get: GetRuntimeSettings
}>

export const assembleRuntimeSettingsSlice = (
  deps: AssembleRuntimeSettingsSliceDeps,
): RuntimeSettingsSlice => {
  const updateRuntimeSettings = makeUpdateRuntimeSettings({
    getSettings: deps.store.get,
    saveSettings: deps.store.save,
    canonicalizePath: makeCanonicalizePath(),
    listAllWorkspaces: deps.listAllWorkspaces,
    deleteWorkspace: deps.deleteWorkspace,
    onLogLevelChanged: deps.onLogLevelChanged,
  })

  return {
    registerRoutes: (app) => {
      registerRuntimeSettingsRoutes(app, {
        getSettings: deps.store.get,
        updateRuntimeSettings,
        appliedRuntimeSettings: deps.appliedRuntimeSettings,
        envBindOverrides: deps.envBindOverrides,
      })
    },
    get: deps.store.get,
  }
}
