import { FastifyInstance } from "fastify"
import { EnvBindOverrides } from "../config/env.bind.overrides"
import { AppliedRuntimeSettingsHolder } from "./applied.runtime.settings"
import { registerRuntimeSettingsRoutes } from "./runtime-settings.routes"
import { RuntimeSettingsFileStore } from "./runtime-settings.file.adapters"
import { GetRuntimeSettings } from "./runtime-settings.ports"

export type AssembleRuntimeSettingsSliceDeps = Readonly<{
  store: RuntimeSettingsFileStore
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
  return {
    registerRoutes: (app) => {
      registerRuntimeSettingsRoutes(app, {
        getSettings: deps.store.get,
        appliedRuntimeSettings: deps.appliedRuntimeSettings,
        envBindOverrides: deps.envBindOverrides,
      })
    },
    get: deps.store.get,
  }
}
