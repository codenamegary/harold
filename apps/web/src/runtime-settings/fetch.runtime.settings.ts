import {
  RUNTIME_SETTINGS_PATH,
  RuntimeSettingsSchema,
} from "contracts/http/runtime-settings"

export const fetchRuntimeSettings = async () => {
  const response = await fetch(RUNTIME_SETTINGS_PATH)

  if (!response.ok) {
    throw new Error(`Runtime settings fetch failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return RuntimeSettingsSchema.parse(payload)
}
