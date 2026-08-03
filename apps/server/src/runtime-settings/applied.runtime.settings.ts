import { AppliedRuntimeSettings } from "./resolve.runtime.settings.state"

export type AppliedRuntimeSettingsHolder = {
  get: () => AppliedRuntimeSettings
}

export const createAppliedRuntimeSettingsHolder = (
  initial: AppliedRuntimeSettings,
): AppliedRuntimeSettingsHolder => {
  const state = { applied: initial }

  return {
    get: () => state.applied,
  }
}
