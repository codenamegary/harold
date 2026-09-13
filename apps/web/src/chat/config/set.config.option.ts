import { SetConfigOptionBody } from "contracts/http/config.options"
import { setConfigOptionPath } from "contracts/http/config.options"

export type ConfigSetError = Error & {
  readonly detail: string
}

const createConfigSetError = (detail: string): ConfigSetError => {
  const error = new Error(detail) as ConfigSetError
  error.name = "ConfigSetError"
  return Object.assign(error, { detail })
}

const readProblemDetail = async (response: Response): Promise<string> => {
  try {
    const payload: unknown = await response.json()
    if (
      typeof payload === "object"
      && payload !== null
      && "detail" in payload
      && typeof payload.detail === "string"
    ) {
      return payload.detail
    }
  } catch {
    // Fall through to the generic message.
  }
  return `Setting the config option failed with ${response.status}`
}

export const setConfigOption = async (params: {
  agentId: string
  sessionId: string
  configId: string
  value: string | boolean
}): Promise<void> => {
  const body: SetConfigOptionBody = { value: params.value }
  const response = await fetch(
    `${setConfigOptionPath(params.sessionId, params.configId)}?agentId=${encodeURIComponent(params.agentId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    throw createConfigSetError(await readProblemDetail(response))
  }
}
