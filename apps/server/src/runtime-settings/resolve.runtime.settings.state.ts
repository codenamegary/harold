import {
  RuntimeSettings,
  RuntimeSettingsEffective,
  RuntimeSettingsOverrides,
  RuntimeSettingsView,
} from "contracts/http/runtime-settings"
import { EnvBindOverrides } from "../config/env.bind.overrides"

export type AppliedRuntimeSettings = RuntimeSettingsEffective

export type ResolveEffectiveBindInput = {
  persisted: Pick<RuntimeSettings, "bindHost" | "bindPort">
  envOverrides: EnvBindOverrides
}

export type ResolveEffectiveBindResult = {
  bindHost: "127.0.0.1"
  bindPort: number
  overrides: RuntimeSettingsOverrides
}

export const resolveEffectiveBind = (
  input: ResolveEffectiveBindInput,
): ResolveEffectiveBindResult => {
  const { persisted, envOverrides } = input
  const overrides: RuntimeSettingsOverrides = {}

  const bindHost =
    envOverrides.bindHost === undefined ? persisted.bindHost : envOverrides.bindHost
  if (envOverrides.bindHost !== undefined) {
    overrides.bindHost = "env"
  }

  const bindPort =
    envOverrides.bindPort === undefined ? persisted.bindPort : envOverrides.bindPort
  if (envOverrides.bindPort !== undefined) {
    overrides.bindPort = "env"
  }

  return { bindHost, bindPort, overrides }
}

export const computeRestartRequired = (params: {
  persisted: RuntimeSettings
  applied: AppliedRuntimeSettings
}): boolean => {
  const { persisted, applied } = params

  return (
    persisted.bindHost !== applied.bindHost ||
    persisted.bindPort !== applied.bindPort ||
    persisted.logPath !== applied.logPath
  )
}

export const buildAppliedRuntimeSettings = (params: {
  persisted: RuntimeSettings
  envOverrides: EnvBindOverrides
}): AppliedRuntimeSettings => {
  const { bindHost, bindPort } = resolveEffectiveBind({
    persisted: params.persisted,
    envOverrides: params.envOverrides,
  })

  return {
    bindHost,
    bindPort,
    logPath: params.persisted.logPath,
  }
}

export const buildRuntimeSettingsView = (params: {
  persisted: RuntimeSettings
  applied: AppliedRuntimeSettings
  envOverrides: EnvBindOverrides
}): RuntimeSettingsView => {
  const { overrides } = resolveEffectiveBind({
    persisted: params.persisted,
    envOverrides: params.envOverrides,
  })

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
