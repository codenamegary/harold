import {
  LOGS_PATH,
  LogCollectionSchema,
  LogSource,
} from "contracts/http/logs"
import { LogLevel } from "contracts/http/runtime-settings"

export type FetchLogsParams = {
  level?: LogLevel
  source?: LogSource
  agentId?: string
}

export const fetchLogs = async (params: FetchLogsParams = {}) => {
  const searchParams = new URLSearchParams()

  if (params.level !== undefined) {
    searchParams.set("level", params.level)
  }
  if (params.source !== undefined) {
    searchParams.set("source", params.source)
  }
  if (params.agentId !== undefined && params.agentId !== "") {
    searchParams.set("agentId", params.agentId)
  }

  const query = searchParams.toString()
  const url = query === "" ? LOGS_PATH : `${LOGS_PATH}?${query}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Logs fetch failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return LogCollectionSchema.parse(payload)
}
