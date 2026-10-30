import {
  RuntimeSettings,
  RuntimeSettingsEffective,
  RuntimeSettingsOverrides,
  RuntimeSettingsView,
} from "contracts/http/runtime-settings"
import { EnvBindOverrides } from "../config/env.bind.overrides"

export type AppliedRuntimeSettings = RuntimeSettingsEffective

export type ResolveEffectiveBindOverridesResult = {
  overrides: RuntimeSettingsOverrides
}

export const resolveEffectiveBindOverrides = (
  envOverrides: EnvBindOverrides,
): ResolveEffectiveBindOverridesResult => {
  const overrides: RuntimeSettingsOverrides = {}

  if (envOverrides.bindPort !== undefined) {
    overrides.bindPort = "env"
  }

  return { overrides }
}

export const resolveEffectiveBindPort = (params: {
  persisted: RuntimeSettings
  envOverrides: EnvBindOverrides
}): number =>
  params.envOverrides.bindPort === undefined
    ? params.persisted.bindPort
    : params.envOverrides.bindPort

export const computeRestartRequired = (params: {
  persisted: RuntimeSettings
  applied: AppliedRuntimeSettings
}): boolean => {
  const { persisted, applied } = params

  return persisted.bindPort !== applied.bindPort || persisted.logPath !== applied.logPath
}

export const buildAppliedRuntimeSettings = (params: {
  persisted: RuntimeSettings
  envOverrides: EnvBindOverrides
}): AppliedRuntimeSettings => {
  return {
    bindPort: resolveEffectiveBindPort(params),
    logPath: params.persisted.logPath,
  }
}

export const buildRuntimeSettingsView = (params: {
  persisted: RuntimeSettings
  applied: AppliedRuntimeSettings
  envOverrides: EnvBindOverrides
}): RuntimeSettingsView => {
  const { overrides } = resolveEffectiveBindOverrides(params.envOverrides)

  return {
    settings: params.persisted,
    restartRequired: computeRestartRequired({
      persisted: params.persisted,
      applied: params.applied,
    }),
    effective: params.applied,
    overrides,
  }
}
