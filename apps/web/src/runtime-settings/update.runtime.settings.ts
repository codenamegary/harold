import {
  UpdateRuntimeSettingsBody,
  UpdateRuntimeSettingsResponseSchema,
} from "contracts/http/runtime-settings"

export const updateRuntimeSettings = async (body: UpdateRuntimeSettingsBody) => {
  const response = await fetch("/v1/settings/runtime", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Runtime settings update failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return UpdateRuntimeSettingsResponseSchema.parse(payload)
}
