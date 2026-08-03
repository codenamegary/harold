import { RuntimeSettingsSchema } from "contracts/http/runtime-settings"

export const fetchRuntimeSettings = async () => {
  const response = await fetch("/v1/settings/runtime")

  if (!response.ok) {
    throw new Error(`Runtime settings fetch failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return RuntimeSettingsSchema.parse(payload)
}
