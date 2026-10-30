import { readEnvBindOverrides } from "server/config/env.bind.overrides"
import { Config } from "server/config"
import { makeRuntimeSettingsFileStore, seedDefaultsFromConfig } from "server/runtime-settings"
import { buildAppliedRuntimeSettings } from "server/runtime-settings/effective"

/**
 * The port the daemon answers on: `HAROLD_PORT` overrides, otherwise the
 * `bindPort` persisted in settings.yml. Control-plane commands that dial the
 * daemon must resolve the port exactly like the daemon does at boot, or pair
 * probes and advertises the wrong port when the install moved off 3847.
 */
export const effectiveBindPort = (
  config: Config,
  env: Record<string, string | undefined> = process.env,
): number => {
  const store = makeRuntimeSettingsFileStore({
    dataDir: config.dataDir,
    seedDefaults: seedDefaultsFromConfig(config),
  })
  return buildAppliedRuntimeSettings({
    persisted: store.get(),
    envOverrides: readEnvBindOverrides(env),
  }).bindPort
}
