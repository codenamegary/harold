import { LogLevel } from "contracts/http/runtime-settings"
import { LogRecordInput } from "./logs.models"

const pinoLevelByNumber: Record<number, LogLevel> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

const resolveLevel = (value: unknown): LogLevel => {
  if (typeof value === "number") {
    return pinoLevelByNumber[value] ?? "info"
  }
  switch (value) {
    case "fatal":
    case "error":
    case "warn":
    case "info":
    case "debug":
    case "trace":
      return value
    default:
      return "info"
  }
}

const resolveTimestamp = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString()
    }
  }
  return new Date().toISOString()
}

const formatRequest = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  const method = readString(value.method)
  const url = readString(value.url)
  if (method === undefined || url === undefined) {
    return undefined
  }
  return `${method} ${url}`
}

const formatError = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  return readString(value.message)
}

const formatMessage = (parsed: Record<string, unknown>): string => {
  const parts = [
    readString(parsed.msg),
    readString(parsed.reason),
    formatError(parsed.err),
    formatRequest(parsed.req),
  ].filter((part): part is string => part !== undefined)

  if (parts.length === 0) {
    return JSON.stringify(parsed)
  }
  return parts.join(" ")
}

export const parsePinoLine = (line: string): LogRecordInput | null => {
  const trimmed = line.trim()
  if (trimmed.length === 0) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!isRecord(parsed)) {
      return {
        ts: new Date().toISOString(),
        level: "info",
        source: "server",
        message: trimmed,
      }
    }

    return {
      ts: resolveTimestamp(parsed.time),
      level: resolveLevel(parsed.level),
      source: "server",
      message: formatMessage(parsed),
      agentId: readString(parsed.agentId),
    }
  } catch {
    return {
      ts: new Date().toISOString(),
      level: "info",
      source: "server",
      message: trimmed,
    }
  }
}
