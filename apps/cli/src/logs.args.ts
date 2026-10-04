import { InvalidArgumentError } from "commander"
import { LogLevel, logLevels } from "contracts/http/runtime-settings"

export const parsePositiveInt = (value: string): number => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("expected a positive integer")
  }
  return parsed
}

export const parseLogLevel = (value: string): LogLevel => {
  if ((logLevels as readonly string[]).includes(value)) {
    return value as LogLevel
  }
  throw new InvalidArgumentError(`expected one of: ${logLevels.join(", ")}`)
}
