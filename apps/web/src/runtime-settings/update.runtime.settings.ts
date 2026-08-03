import { AllowedRootHasWorkspacesProblemSchema } from "contracts/http/error"
import {
  RUNTIME_SETTINGS_PATH,
  RuntimeSettingsViewSchema,
  UpdateRuntimeSettingsBody,
} from "contracts/http/runtime-settings"

export type RuntimeSettingsUpdateError = Error & {
  name: "RuntimeSettingsUpdateError"
  problem?: {
    detail: string
    forceDeleteAvailable?: true
  }
}

export const isRuntimeSettingsUpdateError = (
  error: unknown,
): error is RuntimeSettingsUpdateError =>
  error instanceof Error && error.name === "RuntimeSettingsUpdateError"

const createRuntimeSettingsUpdateError = (params: {
  message: string
  problem?: RuntimeSettingsUpdateError["problem"]
}): RuntimeSettingsUpdateError => {
  const error = new Error(params.message) as RuntimeSettingsUpdateError
  error.name = "RuntimeSettingsUpdateError"
  error.problem = params.problem
  return error
}

export const updateRuntimeSettings = async (
  body: UpdateRuntimeSettingsBody,
  options?: { force?: boolean },
) => {
  const url =
    options?.force === true
      ? `${RUNTIME_SETTINGS_PATH}?force=true`
      : RUNTIME_SETTINGS_PATH

  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const payload: unknown = await response.json()

    if (response.status === 409) {
      const parsed = AllowedRootHasWorkspacesProblemSchema.safeParse(payload)
      if (parsed.success) {
        throw createRuntimeSettingsUpdateError({
          message: parsed.data.detail ?? parsed.data.title,
          problem: {
            detail: parsed.data.detail ?? parsed.data.title,
            forceDeleteAvailable: true,
          },
        })
      }
    }

    throw createRuntimeSettingsUpdateError({
      message: `Runtime settings update failed with ${response.status}`,
    })
  }

  const responsePayload: unknown = await response.json()
  return RuntimeSettingsViewSchema.parse(responsePayload)
}
